# Diagnosing & Finding Performance Issues in Software & Web Platforms

## Executive Summary

Software performance degrades silently when small, unmeasured latencies compound across system layers. In high-density, interactive web applications like PDF readers, performance issues manifest as frame drops during scrolling (jank), sluggish touch response, memory bloat, high battery consumption, and tab crashes. Identifying these bottlenecks requires empirical profiling tools, disciplined diagnostic frameworks, and an understanding of hardware-software interaction.

---

## 1. Profiling Toolchain & Diagnostic Methodologies

### 1.1 Chrome DevTools Performance Panel
The Performance panel provides microsecond-accurate event traces of the browser process:
1. **CPU Flame Charts:** Visual representation of the call stack over time.
   - **X-axis:** Time progression.
   - **Y-axis:** Call stack depth.
   - **Inverted Pyramid:** Wide bars at the top represent parent functions; narrow slices below represent child invocations.
2. **Identifying Long Tasks (> 50ms):**
   - The browser indicates tasks exceeding 50ms with a red corner flag.
   - Any task exceeding 50ms blocks the main thread from handling user input (keystrokes, scrolls, clicks), directly degrading **INP (Interaction to Next Paint)**.
3. **Bottom-Up vs. Call Tree Analysis:**
   - **Bottom-Up View:** Aggregates time spent directly inside functions ("Self Time"), instantly highlighting computational bottlenecks (e.g., regex matching, array sorting, canvas coordinate transformations).
   - **Call Tree View:** Highlights the root causal paths ("Total Time") initiating those expensive operations.

### 1.2 Memory Profiling & Leak Detection
Memory issues generally fall into three categories:
1. **Continuous Memory Growth (Leaks):** Allocations that are never garbage collected.
2. **High Memory Churn:** Frequent allocations and deallocations triggering constant GC pauses.
3. **VRAM Exhaustion:** Excessive GPU-backed canvas surfaces or compositor layers exceeding hardware limits.

**Diagnostic Techniques:**
- **Heap Snapshots (Summary & Comparison Views):**
  - Take Snapshot 1 (baseline) $\to$ Perform action (e.g., open PDF, scroll through 50 pages, close PDF) $\to$ Take Snapshot 2 $\to$ Compare.
  - Inspect **Delta**: Look for surviving `HTMLCanvasElement`, `CanvasRenderingContext2D`, `PDFPageProxy`, or closure scopes.
- **Detached DOM Tree Inspection:**
  - In the Class filter, search for `Detached`. Detached DOM nodes are elements removed from the document tree but still referenced by JavaScript variables or event listeners.
- **Allocation Instrumentation on Timeline:**
  - Displays blue spikes (allocations) and gray spikes (freed memory). Sustained tall blue bars that never turn gray signify active leaks.

### 1.3 Rendering & Compositing Diagnostics
Under DevTools **Rendering Tab**:
- **Paint Flashing:** Highlights repainted areas in green rectangles. If scrolling a document causes the entire sidebar or viewer frame to flash green, paint containment is broken.
- **Layout Shift Regions:** Highlights layout shifts in blue, pinpointing elements lacking explicit width/height dimensions.
- **Layer Borders:** Visualizes composited GPU layers in orange and tile boundaries in cyan. Excessive layers cause context-switching overhead and VRAM bloat.
- **Frame Rendering Stats:** Real-time FPS graph and GPU memory usage.

---

## 2. Common Performance Pitfalls in Document Readers & Solutions

### 2.1 The Unbounded Canvas Trap (GPU Memory Collapse)
Each `<canvas>` element allocates uncompressed RGBA bitmap storage in GPU memory:
$$\text{Memory per Canvas} = \text{Width (px)} \times \text{Height (px)} \times 4 \text{ bytes (RGBA)} \times (\text{Device Pixel Ratio})^2$$
For a standard $800 \times 1130$ page rendered at $\text{DPR} = 2$:
$$\text{Canvas Size} = 1600 \times 2260 \times 4 = 14,464,000\text{ bytes} \approx 14.46\text{ MB per page}$$
- If a 100-page document keeps all canvases alive in the DOM, GPU memory consumption surpasses **1.45 GB**, triggering immediate tab crashes (OOM Killer) on mobile devices or legacy laptops.
- **Diagnostic Signal:** Scrolling smoothly for 10 pages, followed by sudden tab crashes without JavaScript stack traces.
- **Remedy:** Strict virtualized canvas destruction lifecycle:
  ```typescript
  export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;  // 💡 Forces GPU buffer deallocation in WebKit/Blink
    canvas.height = 0;
  }
  ```

### 2.2 Virtualization Desynchronization & "Missed Pages"
In virtualized document viewers, placeholder elements represent non-visible pages to maintain scrollbar proportions:
- **The Desynchronization Bug:** When a page hasn't rendered yet, the viewer assumes an estimated height (e.g. 900px, or A4 aspect ratio 1.414). When the user scrolls or jumps to a page, the page renders, measures its true aspect ratio (e.g. 1.25 for landscape or 1.6 for legal format), updates its height, and shifts the entire document scroll offset.
- **The "Missed Page" Bug:** 
  1. The user scrolls rapidly past page $N$.
  2. The intersection check marks page $N$ visible for 1 frame.
  3. `tick().then(render)` executes, but `<canvas>` is null or the render task is cancelled before completing.
  4. The page remains marked as `rendered = false` with an empty canvas, and no further scroll event arrives to re-trigger rendering because the scroll has stopped. The page appears blank ("missed").
- **Diagnostic Method:** Add logging in `$effect` and `render()` to trace the lifecycle:
  `[Page N] visible: true, canvas: present/null, renderToken: T`. Verify that every page entering the viewport executes to completion.

### 2.3 Micro-Stutter via Component Scope Bleed
- **The Issue:** A high-frequency timer (e.g. `sessionTime` updating every 1000ms or a RAF loop) declared inside a parent view (`+page.svelte` or `PdfViewer.svelte`) triggers reactive dirty-checking on the entire viewer, inspecting hundreds of page properties.
- **Diagnostic Signal:** In the Performance flame chart, a periodic 5ms-10ms task executes every second, accompanied by layout tree invalidations.
- **Remedy:** Encapsulate fast-mutating reactive state inside self-contained leaf components (e.g. `<SessionTimer />`), isolating signal propagation to that component's immediate text node.

### 2.4 Synchronous Search Indexing
- **The Issue:** Extracting text and inserting tokens into `MiniSearch` on the main thread blocks UI interaction for 500ms to 3s on large books (100+ pages).
- **Diagnostic Signal:** "Long Task [2450ms]" during document load or search panel activation; typing in the search box has a 2-second delay.
- **Remedy:** Chunk text extraction using `requestIdleCallback` or run the search indexing engine inside a dedicated Web Worker.

---

## 3. Instrumentation & Empirical Benchmarking

### 3.1 User Timing API (`performance.mark` & `measure`)
Don't guess; measure critical milestones directly in code:
```typescript
export async function loadAndRenderPage(pageNum: number) {
  const markStart = `pdf:page:${pageNum}:start`;
  const markEnd = `pdf:page:${pageNum}:end`;
  const measureName = `Render Page ${pageNum}`;

  performance.mark(markStart);
  try {
    await executeRenderPipeline(pageNum);
  } finally {
    performance.mark(markEnd);
    performance.measure(measureName, markStart, markEnd);
    const [entry] = performance.getEntriesByName(measureName);
    if (entry.duration > 50) {
      console.warn(`[Slow Render] Page ${pageNum} took ${entry.duration.toFixed(1)}ms`);
    }
  }
}
```
These measurements appear natively in the Chrome DevTools Performance panel under the **Timings** track, synchronized with CPU flame charts.

### 3.2 Real-User Monitoring (RUM) for Offline Apps
For local-first PWAs:
- Store performance metrics in IndexedDB (`perf_logs` table) sampling page render durations, search query latency, and document open times.
- Expose an internal diagnostics view (`/diagnostics` or debug modal) allowing users to see their device frame rate and memory footprint.
