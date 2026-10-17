# Performance Optimization & Memory Tuning for Constrained Hardware

## Executive Summary

Engineering client-side software to operate reliably on low-end hardware (e.g., low-tier Android phones with 2GB–3GB RAM, budget Chromebooks, legacy 5-year-old laptops) requires a fundamentally different mindset than designing for high-end developer workstations. In memory-constrained environments, browser processes are aggressively terminated by the OS when heap or GPU memory limits are breached. This document details engineering patterns to minimize memory footprint, eliminate garbage collection thrashing, and achieve sub-100ms interaction latency under tight resource budgets.

---

## 1. Memory Constraints & Browser Limits

### 1.1 V8 Heap and Browser Memory Partitions
The browser runtime partitions memory into distinct layers:
1. **JavaScript V8 Heap:** Managed by the V8 garbage collector (typically capped between 512MB and 2GB depending on OS architecture and device RAM).
2. **DOM & Native C++ Nodes:** Layout objects (`RenderObject`), style trees, and DOM elements managed by Blink/WebKit.
3. **GPU / Surface Memory:** Framebuffers, WebGL textures, and `<canvas>` 2D bitmap backing stores. These exist outside the V8 heap and directly consume system VRAM/RAM.
4. **IndexedDB / Blob Storage:** Stored on disk by the browser's storage engine and memory-mapped when queried.

### 1.2 The Cost of Garbage Collection (GC)
V8 uses a generational garbage collector:
- **Young Generation (Minor GC / Scavenger):** Very fast (1ms–3ms), cleans ephemeral objects.
- **Old Generation (Major GC / Mark-Sweep-Compact):** Expensive (20ms–150ms+). Compacting memory requires moving objects and updating pointers.
- **GC Thrashing:** When an application continuously allocates temporary objects in tight loops (e.g., creating arrays or objects inside scroll/render handlers), young generation spaces fill up rapidly, promoting short-lived objects into the old generation. This forces frequent Major GCs, causing perceptible stutter and audio/animation glitches.

---

## 2. Low-Memory Architectural Patterns

### 2.1 Zero-Copy Binary Strategy (ArrayBuffer & Blob)
- **Avoid Base64 Formatting:** Base64 encoding inflates binary payload size by $33\%$ ($\approx \frac{4}{3} \times \text{binary size}$) and creates huge string allocations on the V8 heap that cannot be reclaimed until string garbage collection runs.
- **Direct Blob Storage in IndexedDB:** Store raw PDF documents as native `Blob` instances. Dexie and IndexedDB stream blobs directly to/from disk without deserializing them into the JavaScript heap.
- **Transferable Objects:** When sending large buffers to Web Workers, transfer ownership instead of structured cloning:
  ```typescript
  // ❌ Structured Clone: Duplicates 50MB buffer in memory (100MB peak)
  worker.postMessage({ buffer: arrayBuffer });

  //  Transferable: Transfers pointer directly, zero allocation, instantaneous
  worker.postMessage({ buffer: arrayBuffer }, [arrayBuffer]);
  ```

### 2.2 Strict Canvas Lifecycle Management
Browsers enforce hard limits on active canvas memory. To maintain stability across a 500-page book:
1. **The $N$-Page Window:** Never keep more than $3$ to $5$ canvases actively rasterized in the DOM simultaneously (e.g. Current Page $\pm 1$ page lookahead buffer).
2. **Immediate Canvas Destruction:**
   ```typescript
   export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
     if (!canvas) return;
     const ctx = canvas.getContext('2d');
     if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
     // Setting width & height to 0 forces the browser GPU compositor to deallocate
     // the underlying native OpenGL/DirectX/Metal texture backing store immediately.
     canvas.width = 0;
     canvas.height = 0;
   }
   ```
3. **Canceling In-Flight Render Tasks:**
   If a user scrolls past page 12 before its PDF.js render completes:
   ```typescript
   let renderTask: RenderTask | null = null;
   
   function teardown() {
     if (renderTask) {
       renderTask.cancel(); // 💡 Tells PDF.js engine to halt worker vector rasterization
       renderTask = null;
     }
     releaseCanvas(canvas);
     page?.cleanup(); // Cleans up internal font/image caches in PDF.js
   }
   ```

### 2.3 OffscreenCanvas & Worker Decoupling
To keep the main thread completely clear for 60 FPS touch and scroll animations:
- Detach canvas control via `canvas.transferControlToOffscreen()`.
- Pass the `OffscreenCanvas` to the PDF render worker.
- The worker executes all PDF vector math and paints directly to the offscreen buffer. The browser compositor displays the result on screen without main thread intervention.

---

## 3. High-Performance Virtual Scrolling Architecture

When rendering documents with hundreds or thousands of pages, the DOM node count must remain constant $O(1)$, independent of total document page count.

### 3.1 Geometry Estimation & Predictive Height Adjustment
```
┌──────────────────────────────────────────────────────────┐
│ Non-rendered Pages (1..N-2):                              │
│ Clean placeholder <div> with known/estimated height       │
├──────────────────────────────────────────────────────────┤
│ Overscan Buffer Top (Page N-1): Canvas rendering         │
├──────────────────────────────────────────────────────────┤
│ ACTIVE VIEWPORT (Page N): Canvas + TextLayer + Highlights│
├──────────────────────────────────────────────────────────┤
│ Overscan Buffer Bottom (Page N+1): Canvas rendering      │
├──────────────────────────────────────────────────────────┤
│ Non-rendered Pages (N+2..Total):                         │
│ Clean placeholder <div> with known/estimated height       │
└──────────────────────────────────────────────────────────┘
```

1. **Pre-fetching Aspect Ratios:**
   Instead of waiting for every page to render before knowing its height:
   - On document load, asynchronously inspect page viewports via `doc.getPage(p)` (or read the `/MediaBox` from the PDF dictionary if accessible) to populate an in-memory `Map<number, number>` of exact page aspect ratios.
   - This prevents scrollbar jumps and layout shifts when navigating to distant pages.
2. **Scroll Offset Calculation with Binary Search:**
   With dynamic page heights stored in a cumulative array (`prefixSums`), finding the visible page for a given `scrollTop` takes $O(\log N)$ time using binary search instead of an $O(N)$ linear loop over all pages on every scroll event.

---

## 4. Object Lifecycle & Leak Prevention Checklist

1. **Unsubscribe Subscriptions in `$effect`:**
   In Svelte 5, any observable or event listener attached in `$effect` must return a cleanup function:
   ```typescript
   $effect(() => {
     const sub = liveQueryCollection.subscribe(handleUpdate);
     return () => sub.unsubscribe();
   });
   ```
2. **PDF Document Destruction:**
   When closing a document or switching to another PDF:
   ```typescript
   export function closeDocument(doc: PDFDocumentProxy | null) {
     if (!doc) return;
     // Disposes worker threads, font resources, and stream buffers
     doc.destroy();
   }
   ```
3. **TextLayer Element Cleanup:**
   Use `textEl.replaceChildren()` or remove child nodes explicitly to ensure detached text spans and event listeners are promptly recycled.
4. **Compile-Time Literals over Enums:**
   Use TypeScript string-literal unions (`type Tab = 'notes' | 'highlights' | 'outline'`) instead of numeric/string `enum`. Enums generate self-invoking functions that persist on the heap; string literals compile directly into primitive strings, fully optimized by V8 string intern tables.
