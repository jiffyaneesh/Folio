# Svelte, SvelteKit, JavaScript Optimization & Web Platform Performance

## Executive Summary

Modern web client performance requires a synthesis of runtime mechanics, engine-level compilation, layout execution pipelines, and reactive state systems. Building high-performance, resource-constrained applications like Folio—a local-first, zero-backend, browser-native PDF workstation—demands zero-overhead abstractions, surgical reactivity, and adherence to browser hardware and rendering boundaries.

---

## 1. Svelte 5 Runes Architecture & Reactivity

### 1.1 The Shift from Svelte 4 to Svelte 5
In Svelte 3 and 4, reactivity was achieved via top-level `let` declarations and compiler-injected dirty-checking masks (`$$invalidate`). While fast, this model had structural limits:
1. **Component-boundary reactivity:** Reactivity was scoped to `.svelte` files; external stores required `writable()` contracts, RxJS-like subscriptions, and boilerplate unsubscribe handlers.
2. **Coarse invalidation:** Changing one property inside an object often invalidated the entire component scope, triggering re-renders of unrelated DOM expressions within that template block.

Svelte 5 replaces compiler-transformed assignments with a universal fine-grained signal primitive called **Runes**:
- `$state(initialValue)`: Creates a deeply reactive proxy. Mutating nested properties triggers notifications only to direct consumers.
- `$derived(expression)`: Creates a memoized reactive computation that evaluates lazily and re-runs only when dependent upstream signals change.
- `$effect(fn)`: Coordinates side effects (DOM interaction, timer synchronization, external subscriptions) running strictly after the DOM has updated. Supports cleanup functions returned from the callback.
- `$props()`: Declares component contracts with native destructuring, default values, and type safety without synthetic `export let` statements.

### 1.2 Fine-Grained Signals vs. Virtual DOM
Unlike React or Vue (Virtual DOM diffing), Svelte 5 does not construct an in-memory virtual tree of the document on every state change. 
- In Virtual DOM systems, an update at the root triggers subtree reconciliation: generating $O(N)$ VNodes, calculating diffs, and applying patches.
- In Svelte 5's signal graph, dependencies are linked directly to DOM text nodes and element attribute setters via closure-based subscriber hooks. When `app.currentPage` increments, only the specific element binding (`<span>Page {app.currentPage}</span>`) updates directly with $O(1)$ operations, completely bypassing tree traversal.

### 1.3 Reactivity Anti-Patterns in Client Apps
- **Over-reactive loops in `$effect`:** Triggering state mutations inside `$effect` that depend on the same state causes infinite loops or microtask starvation. Use `$derived` for computed values.
- **Leaking un-tracked state:** Storing large non-reactive structures (like `PDFDocumentProxy` or raw `ArrayBuffer`s) inside deep `$state` proxies causes unnecessary Proxy wrapping overhead. Keep raw binary payloads and library handles either as plain class properties or separate private module variables (`#index`, `doc: PDFDocumentProxy | null`).

---

## 2. JavaScript Engine & V8 Optimization Fundamentals

JavaScript engines (V8 in Chromium, JavaScriptCore in WebKit, SpiderMonkey in Gecko) use multi-tier JIT compilers (e.g., V8's Ignition interpreter $\to$ Sparkplug $\to$ Maglev $\to$ TurboFan optimizing compiler). Writing high-throughput code requires cooperating with these compilation pipelines.

### 2.1 Hidden Classes (Shapes) and Object Transitions
V8 creates internal "hidden classes" (Shapes/Maps) to represent the structure of JavaScript objects in memory:
```typescript
// ❌ Anti-pattern: Dynamic property addition induces shape transitions
function createPageInfo() {
  const page: any = {};
  page.num = 1;      // Transition to Shape 1
  page.height = 800;  // Transition to Shape 2
  page.width = 600;   // Transition to Shape 3
  return page;
}

//  Optimized: Monomorphic structure initialized in fixed order
interface PageInfo {
  num: number;
  height: number;
  width: number;
}
function createPageInfo(num: number, height: number, width: number): PageInfo {
  return { num, height, width }; // Single Shape instantiated immediately
}
```
When objects mutate their shape dynamically, engine inline caches deoptimize, forcing slow dictionary lookups.

### 2.2 Inline Caches (ICs) and Monomorphism
An Inline Cache records property lookup offsets at call sites:
- **Monomorphic:** Encountered exactly 1 shape. Direct memory offset access (near machine-code speed).
- **Polymorphic:** Encountered 2 to 4 distinct shapes. Branch table lookup.
- **Megamorphic:** Encountered 5+ shapes. Falls back to global hash table search ($10\times$ to $50\times$ slower).
To ensure monomorphism:
1. Always initialize object properties in the exact same order within constructor functions or object literals.
2. Avoid `delete obj.property`; instead, set `obj.property = undefined` or use dedicated data structures like `Map`.

### 2.3 Deoptimization Traps
TurboFan optimizes functions based on type feedback. If assumptions fail, it triggers "deoptimization" (bailout to interpreted bytecode):
- Passing mixed types (e.g., passing a float to an arithmetic loop previously fed only 32-bit Small Integers (SMIs)).
- Accessing out-of-bounds array indices (converts dense arrays to sparse dictionary mode).
- Modifying the `arguments` object or using `eval()`.

---

## 3. Web Platform Rendering Pipeline & Bottlenecks

### 3.1 The 5-Stage Rendering Pipeline
To achieve consistent 60 FPS / 120 FPS frame pacing (16.6ms / 8.3ms frame budgets), understand how the browser processes changes:
$$\text{JavaScript} \longrightarrow \text{Style Recalculation} \longrightarrow \text{Layout (Reflow)} \longrightarrow \text{Paint} \longrightarrow \text{Composite}$$

1. **JavaScript:** DOM manipulation, event callbacks, reactive updates.
2. **Style:** Matching CSS selectors and calculating computed styles ($O(N \cdot M)$ complexity where $N$ is matching elements and $M$ is selector depth).
3. **Layout:** Calculating exact geometric coordinates and bounding boxes. Modifying dimensions (`width`, `height`, `margin`, `top`, `left`, `fontSize`) forces global layout recalculation.
4. **Paint:** Rasterizing vector instructions into pixel bitmaps. Modifying colors, shadows, borders, or text triggers repaints.
5. **Composite:** Sending raster layers as GPU textures for final screen composition. Modifying only `transform` and `opacity` bypasses Layout and Paint entirely, running on the compositor thread.

### 3.2 Layout Thrashing (Forced Synchronous Layout)
Layout thrashing occurs when JavaScript writes to the DOM and immediately queries layout geometry in an alternating loop:
```typescript
// ❌ Toxic Pattern: Interleaved DOM write + read forces synchronous reflow
for (let i = 0; i < elements.length; i++) {
  elements[i].style.width = width + 'px'; // WRITE (invalidates layout)
  const box = elements[i].getBoundingClientRect(); // READ (forces immediate sync reflow)
}

//  Batching Pattern: Read all, then write all
const boxes = elements.map(el => el.getBoundingClientRect()); // Batch READ
elements.forEach((el, i) => {
  el.style.width = width + 'px'; // Batch WRITE
});
```
In virtualized document viewers, geometry measurements must be collected during passive resize events (`ResizeObserver`) or cached in state maps (`Map<number, number>`), never polled during scroll frames.

### 3.3 Hardware Acceleration & Compositing Layers
- Use `contain: layout paint;` or `content-visibility: auto;` on off-screen or repeated container nodes (e.g. PDF page containers). This informs the browser engine that the internal layout of that element is completely independent of the rest of the document tree.
- Use `will-change: transform` sparingly on active dragging elements, and remove it once interactions complete to prevent excessive GPU texture memory consumption.

---

## 4. Modern Web Performance Metrics (Core Web Vitals)

| Metric | Target | Description | Key Optimization Strategy |
|---|---|---|---|
| **LCP** (Largest Contentful Paint) | $\le 2.5\text{s}$ (Good) | Time when the main content (e.g., PDF viewer / library hero) is rendered. | Inline critical CSS, prefetch fonts/icons, code-split heavy dependencies (`pdfjs-dist`). |
| **INP** (Interaction to Next Paint) | $\le 200\text{ms}$ | Latency of all discrete user interactions (clicks, keyboard input, drag handles). | Move heavy computations (text parsing, search indexing) off the main thread to Web Workers. |
| **CLS** (Cumulative Layout Shift) | $\le 0.1$ | Visual stability of the viewport during asset loading. | Reserve explicit aspect-ratio placeholders for rendering pages before bitmap generation. |
| **TBT** (Total Blocking Time) | $\le 200\text{ms}$ | Accumulated duration between FCP and TTI where tasks exceed 50ms. | Break long tasks with `scheduler.yield()` or microtask queues. |

---

## 5. SvelteKit Performance Tuning for Folio

### 5.1 Static Adapter Architecture
Folio uses `@sveltejs/adapter-static` with:
```typescript
export const ssr = false;
export const prerender = false;
```
This produces a zero-server SPA fallback (`index.html`). Because there is no Node.js/edge server runtime:
1. Bootstrapping relies entirely on client-side JS evaluation.
2. Initial bundle size is paramount. Any byte shipped directly delays the first render.

### 5.2 Code-Splitting and Manual Chunking
In `vite.config.ts`, heavy third-party libraries are isolated into dedicated chunks:
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('pdfjs-dist')) return 'pdfjs-core';
        if (id.includes('dexie')) return 'storage-core';
        if (id.includes('minisearch')) return 'search-core';
      }
    }
  }
}
```
This ensures:
- The initial UI shell loads without parsing the 2MB+ PDF.js engine.
- IndexedDB storage initializes in parallel.
- Search indexing is loaded only when requested.

### 5.3 Workbox PWA Strategy
Through `@vite-pwa/sveltekit`, Folio precaches the app shell, HTML fallback, WASM/worker bundles, and runtime fonts (`CacheFirst`). When offline, the application functions identically to a native desktop executable, reading and writing entirely from browser-persistent storage.
