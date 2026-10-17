# Product Strategy: Building Features Users Need & Outperforming Competitors

## Executive Summary

Software differentiation is rarely won by feature volume. Bloated applications accumulate technical debt, cognitive overhead, and performance degradation. Winning software succeeds through sharp positioning, acute empathy for the user's core problem, and uncompromising execution of primary workflows. This document examines product discovery frameworks, user needs versus wants, competitor landscape analysis, and strategic feature roadmaps for Folio.

---

## 1. Product Discovery & User Psychology Frameworks

### 1.1 The Jobs-to-be-Done (JTBD) Theory
Users do not buy or use software for the product itself; they "hire" the product to make progress in a specific life situation:
> *"When I am deeply engaging with complex academic papers, technical documentation, or long-form books, I want to effortlessly highlight passages and capture thoughts without breaking my cognitive flow, so that I can permanently retain and synthesize core knowledge over time."*

#### Core Functional Job:
Read, navigate, and comprehend multi-page PDF documents quickly on any device.
#### Core Emotional Job:
Feel focused, confident, and free from the distraction of notifications, subscription nag-screens, and clunky toolbars.
#### Core Social Job:
Build a reliable, portable personal knowledge repository that does not lock notes into proprietary cloud silos.

### 1.2 User Wants vs. User Needs
Product management failure often stems from confusing surface *wants* with underlying *needs*:

| Surface Request (What Users Say) | Underlying Need (What Users Truly Require) | Strategic Product Response |
|---|---|---|
| *"Add an AI chatbot that answers questions on every page."* | *"I want to quickly grasp dense jargon or complex equations without losing my place."* | Provide instant definition lookups, key term indexing, and inline glossary tooltips rather than distracting chat sidebars. |
| *"Add 20 different export integrations (Notion, Roam, Evernote, Obsidian)."* | *"I fear losing my notes if I change apps; I want ownership of my data."* | Implement a clean, standardized, 1-click **Export to Markdown & JSON** that works natively with any file system or PKM tool. |
| *"Add social sharing and reading leaderboards."* | *"I want motivation to read consistently and track my learning progress."* | Implement private reading streaks, daily time analytics, and local spaced-repetition due queues without invasive telemetry. |
| *"Add customizable toolbars with 30 PDF editing tools."* | *"I want the document to look natural and readable for my screen size."* | Provide seamless auto-zoom, clean margins, high-contrast dark/warm-slate modes, and quick keyboard navigation. |

---

## 2. Competitive Analysis: The PDF Reader & Research Tool Landscape

| Product | Target Audience | Key Strengths | Critical Pain Points & Vulnerabilities |
|---|---|---|---|
| **Adobe Acrobat** | Enterprise / Legal / General | Standard-bearer, full PDF spec support, form signing. | Heavyweight (~200MB installer), slow startup (4s–8s), expensive subscriptions ($20/mo), aggressive cloud upsells. |
| **Zotero** | Academics / Researchers | Reference management, citation graph, open-source ecosystem. | Complex desktop UI, steep learning curve, sync requires setup or paid storage, mobile web experience is limited. |
| **Readwise Reader** | Power Readers / Lifelong Learners | Cross-document highlights, RSS/EPUB/PDF in one place. | Requires ongoing $10/mo subscription, requires online account, upload latencies, heavy client bundle. |
| **Apple Books / Preview** | macOS / iOS Consumers | Native performance, clean rendering, simple UI. | Lacks spaced repetition, notes are trapped in Apple ecosystem, no cross-platform Linux/Windows/Android support. |
| **Folio (Our Edge)** | Serious Students, Researchers, Engineers | **100% offline, zero-account, instantaneous startup, local SM-2 flashcard generation, warm paper / dark mode, <150kb bundle.** | Needs advanced navigation polish, bookmarking resilience, multi-color highlighting, and flexible annotation exports. |

---

## 3. The Kano Feature Prioritization Model

To construct a high-impact product roadmap, features are categorized using the Kano Model:

```
Customer Satisfaction
       ▲
       │                  Delighters (Unexpected Joy: Flashcards from highlights, Warm Paper)
       │                 /
       │                /  Performance Features (Search speed, rendering latency, zoom fluidity)
       │               /
───────┼──────────────/──────────────────────────────► Execution Level
       │             /
       │            /   Must-Haves (Never lose page, crisp text, fast scroll, zero crash)
       │           /
       ▼
```

### 3.1 Must-Haves (Basic Expectations)
- **Zero Page Misses:** Scrolling through any document (regardless of length or zoom) must reliably render every single page without blank artifacts.
- **Persistent State Retention:** Reopening a document must instantly restore the exact page and reading position where the user stopped.
- **Accurate Outline & Bookmarking:** PDF table of contents with depth levels must allow 1-click jumps.
- **Fluid Zooming:** Keyboard (`+`, `-`, `0`) and control buttons must smoothly rescale without breaking layout.

### 3.2 Performance Features (Linear Satisfaction)
- **Sub-100ms Search:** Instant full-text fuzzy lookup across all document pages.
- **Instant Library Ingestion:** Drag-and-drop ingestion with fast content hashing (`SHA-256`) and local blob persistence.
- **Responsive Touch & Bottom Sheet:** Mobile layout transforms smoothly into a draggable bottom sheet.

### 3.3 Delighters (Competitive Differentiation)
- **Zero-Friction Active Recall:** Highlighting text and adding a note automatically constructs an SM-2 spaced repetition card, turning passive reading into long-term retention.
- **Tactile Warm Slate Theme:** Authentic reading desk aesthetics that reduce glare and eye fatigue.
- **One-Click Markdown Export:** Export all highlights, page references, and notes into cleanly formatted Markdown for Obsidian/Logseq/Notion.
- **Zen Focus Mode:** One-key shortcut (`Z` or `F11`) to hide all toolbars, panels, and chrome for immersive reading.

---

## 4. Strategic Feature Roadmap for Folio

### Phase 1: Robust Core Reader & State Foundations (Immediate)
1. **Bulletproof Page Restoration & Viewport Anchoring:**
   - Store exact reading progress (`lastPage`, percentage, timestamp) in IndexedDB.
   - Accurately calculate page heights upfront so jumping to a saved page lands precisely without layout drift.
   - Robust render queue to guarantee no page is ever missed during fast scrolling.
2. **WealthAi Design System Alignment:**
   - Implement Warm Slate palette (Warm Paper light mode `hsl(40 30% 97%)`, Deep Navy dark mode `hsl(222 47% 6%)`).
   - Standardize type scale with Inter (`cv02`, `cv03`, `cv04`, `cv11`) and JetBrains Mono.
   - Refactor spacing to the 4px grid and standard corner radii (`rounded-md`, `rounded-xl`, `rounded-2xl`).

### Phase 2: Workflow & Retention Improvisations
1. **Multi-Color Highlighting:**
   - Support standard semantic highlight hues: Amber (key point), Blue (definition/citation), Green (evidence/quote), Pink (question/critique).
2. **Export & Portability:**
   - "Export Notes to Markdown" button: Generates a `.md` file containing document title, metadata, citation list, and page-anchored notes.
3. **Manual Bookmarks & Reading Progress:**
   - Ability to manually bookmark favorite pages in addition to the embedded PDF outline.
   - Visual reading progress bar in toolbar with quick jump slider.
4. **Active Recall Deck Management:**
   - Deck statistics summary: Cards due today, cards learned, retention ease factor breakdown.
