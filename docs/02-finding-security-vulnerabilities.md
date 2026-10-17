# Finding Security Vulnerabilities in Client-Side Software & PDF Applications

## Executive Summary

Client-side and local-first software models shift the traditional threat vector: while eliminating remote server-side SQL injection or remote code execution against a backend database, they introduce intense exposure to malicious file handling, memory safety violations within web runtimes, DOM-based cross-site scripting (DOM XSS), prototype pollution, client-side data leaks, and service worker manipulation. This document details vulnerability assessment methodologies, threat models, and architectural hardening techniques for browser-based document platforms.

---

## 1. Threat Modeling for Local-First Applications (STRIDE)

In a serverless, local-first app like Folio (relying on browser storage such as IndexedDB and client-side PDF.js rendering), we evaluate the STRIDE threat model:

| STRIDE Threat | Web/Client Manifestation | Impact in Folio Context |
|---|---|---|
| **Spoofing** | Origin spoofing, malicious domain masquerading as Folio PWA. | Attackers trick user into storing documents in an illegitimate origin. |
| **Tampering** | Modifying IndexedDB objects, poisoning Service Worker cache entries, tampering with PDF bytecode. | Compromised document integrity or malicious logic injection during offline boot. |
| **Repudiation** | Modification of flashcard/note records without audit trails. | Low risk in local single-user context, but critical if sync engines are introduced. |
| **Information Disclosure** | Data extraction from IndexedDB via XSS, memory dumping via canvas extraction, side-channel timing attacks. | Sensitive academic or proprietary documents leaked to remote command-and-control servers. |
| **Denial of Service** | Malicious PDF "zip bomb" (decompression bomb), regex DoS in text search, infinite loop in SM-2 math, GPU VRAM exhaustion. | Browser tab freezes, browser process crashes, loss of uncommitted notes/highlights. |
| **Elevation of Privilege** | Bypassing PDF sandbox to execute arbitrary JS in top-level origin; escaping iframe/worker contexts. | Full execution capability within user's browser origin, theft of all stored IndexedDB documents. |

---

## 2. PDF Parsing Hazards & Exploitation Vectors

The PDF specification (ISO 32000-1 / 32000-2) is notoriously complex, spanning over 1,000 pages of specifications including embedded fonts, raster graphics, vector stream filters, 3D models, JavaScript actions, form scripts, and multimedia containers.

### 2.1 Embedded JavaScript & Action Handlers
PDF documents can define interactive actions executed upon opening or navigating pages:
- `/OpenAction` and `/AA` (Additional Actions): Can invoke `/JavaScript` or `/Launch` actions.
- `/URI` Actions: Automatically redirect the host browser or trigger external resource fetches.
- **Vulnerability:** If a PDF viewer executes embedded JavaScript in the context of the application's origin, the attacker achieves instant DOM XSS and can exfiltrate all IndexedDB databases (`FolioDB`).
- **Mitigation in PDF.js:**
  ```typescript
  // PDF.js getDocument configuration:
  const task = pdfjs.getDocument({
    data: pdfBytes,
    enableScripting: false,       // 🔒 HARD DISABLE: Never execute embedded PDF JS
    isEvalSupported: false,       // 🔒 Disable unsafe eval in PDF worker
    disableFontFace: false,       // Use sanitized font loading
    cMapUrl: '/cmaps/',
    cMapPacked: true
  });
  ```

### 2.2 Malformed Font & Stream Exploits (Buffer Overflows & Decompression Bombs)
- **FlateDecode / JBIG2 / JPX / TrueType font tables:** Attackers craft malformed font tables or compressed stream headers that trigger infinite recursion, integer overflows, or out-of-bounds memory access in C++ or WASM-based parsers.
- In JavaScript-based parsers like PDF.js, memory corruption is bounded by the V8 memory cage, but memory exhaustion (OOM crashes) or long main-thread execution freezes are prevalent.
- **Defensive Measure:** Parse all stream transformations strictly within an isolated Web Worker (`pdf.worker.min.mjs`), ensuring that parser hangs or crashes kill only the worker thread, leaving the UI alive to report an error gracefully.

---

## 3. Client-Side Web Vulnerabilities

### 3.1 DOM-Based Cross-Site Scripting (DOM XSS)
DOM XSS occurs when untrusted input is inserted into the DOM using dangerous sinks without sanitization.

**Dangerous Sinks to Audit:**
- `element.innerHTML`
- `element.outerHTML`
- `document.write()`
- `element.insertAdjacentHTML()`
- `eval()`, `new Function()`, `setTimeout(string)`
- `location.href = untrustedUrl`

**The TextLayer Attack Vector:**
When PDF.js extracts text for the selection layer:
```typescript
// ❌ Toxic Vulnerability: Direct innerHTML from PDF text stream
const textContent = await page.getTextContent();
textEl.innerHTML = textContent.items.map(it => it.str).join(''); // XSS if str contains <img src=x onerror=...>

//  Secure Implementation: Using PDF.js TextLayer API or textContent
textEl.replaceChildren(); // Wipes previous children safely
const tl = new TextLayer({
  textContentSource: await page.getTextContent(),
  container: textEl,
  viewport: tvp
});
await tl.render(); // Creates isolated <span> elements with .textContent (safe text nodes)
```
In Svelte 5, default mustache syntax (`{value}`) automatically assigns values via `.textContent` or element properties, neutralizing HTML injection. The `{@html ...}` tag must be strictly forbidden unless passed through an aggressive sanitizer like DOMPurify.

### 3.2 Prototype Pollution
Prototype pollution occurs when user-controlled object keys (e.g. `__proto__`, `constructor.prototype`) mutate Object prototype, altering global application behavior or leading to remote code execution if gadgets exist.
- Audit all recursive merge functions, deep clone utilities, and query parsers.
- Use `Object.create(null)` for key-value dictionary caches, or use native `Map` and `Set` instances.

### 3.3 Storage Vulnerabilities & Data Leakage in IndexedDB
1. **Unbounded Storage Growth (Denial of Service):** Maliciously huge files or duplicate uploads can exceed quota limits (`navigator.storage.estimate()`), causing subsequent write operations to fail silently. Always handle `QuotaExceededError`.
2. **Object URL Memory Leaks:** Creating Object URLs with `URL.createObjectURL(blob)` and failing to call `URL.revokeObjectURL(url)` leaks pointers in browser memory until tab destruction.
3. **Cross-Origin Access:** IndexedDB conforms strictly to the Same-Origin Policy (SOP). However, subdomains or compromised third-party scripts loaded without Subresource Integrity (SRI) can read the database.

---

## 4. Security Auditing & Vulnerability Discovery Methodology

### 4.1 Static Application Security Testing (SAST)
- **ESLint Security Rules:** Integrate `eslint-plugin-security` to detect regular expression DoS (ReDoS), unsafe regex lookaheads, dynamic `require()`/`import()`, and buffer allocation risks.
- **CodeQL & Semgrep:** Run continuous semantic AST scans to trace untrusted data from sources (file inputs, drag-and-drop payloads, postMessage channels) to critical sinks (DOM, evaluation, storage).

### 4.2 Dynamic Analysis & Fuzzing (DAST)
- **PDF Fuzzing:** Pass corpus test suites from PDF Association and known CVE test payloads (e.g., malformed PDF cross-reference tables (`/XRef`), circular `/Pages` trees, truncated stream dictionaries) into the document loader to verify error handling without unhandled promise rejections.
- **Browser Memory Profiling under Malicious Loads:** Monitor allocation timelines to ensure memory caps prevent heap exhaustions.

### 4.3 Supply Chain & Dependency Auditing
Folio relies on critical third-party dependencies: `pdfjs-dist`, `dexie`, `minisearch`.
- **Lockfile Enforcement:** Use strict lockfile validation (`pnpm install --frozen-lockfile`).
- **Automated Scanning:** Run `pnpm audit`, GitHub Dependabot, and OSV scanning on every commit.
- **Dependency Minimization:** Zero unnecessary UI utility libraries; evaluate transitive dependencies to reduce attack surface.

---

## 5. Security Architecture Hardening Checklist for Folio

1. **Content Security Policy (CSP):**
   ```http
   Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none';
   ```
   - Disallow external script execution.
   - Forbid `object-src` (plugins like Flash/Java are deprecated, but explicit blocking prevents embedding rogue plugins).
   - Enforce `frame-ancestors 'none'` to eliminate clickjacking.
2. **Input Validation on Document Ingestion:**
   - Verify magic bytes (`%PDF-`) at the buffer start before initiating PDF worker tasks.
   - Restrict file upload MIME types and inspect file sizes.
3. **Safe Storage Management:**
   - Atomic Dexie transactions: Ensure operations involving related entities (e.g., deleting a highlight and its associated flashcard and note) occur within `db.transaction('rw', ...)` to prevent orphan records or inconsistent state.
