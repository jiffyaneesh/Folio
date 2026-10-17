# UI/UX Engineering, Design Systems & Visual Hierarchy

## Executive Summary

Exceptional user interfaces balance visual calm, typography-driven hierarchy, ergonomic interaction patterns, and predictable spatial layout. Software built for deep, sustained focus—such as document readers and research workstations—must minimize cognitive friction. This document outlines the principles of systematic UI/UX engineering, integrating the WealthAi Design System contract (`DESIGN.md`), fluid layout mechanics, typography hierarchies, and accessible design systems.

---

## 1. Visual Hierarchy & The Warm Slate Design System

### 1.1 Identity & Theme Philosophy
According to the WealthAi Design Specification:
- **Light Theme ("Warm Paper"):** Background `hsl(40 30% 97%)` with deep navy primary typography `hsl(220 45% 12%)` and a vibrant blue accent `hsl(215 85% 55%)`. Warm paper mimics high-grade archival book stock, dramatically reducing eye fatigue during multi-hour reading sessions compared to stark `#ffffff`.
- **Dark Theme ("Near-Navy Field"):** Canvas background `hsl(222 47% 6%)` layered with soft blue/indigo atmospheric radials (`--app-bg`), translucent navy card surfaces (`bg-card/75 backdrop-blur`), and primary actions flipping to clear blue `hsl(215 85% 60%)`.
- **The Core Rule:** "Spend boldness in one place per screen. Chrome stays quiet: paper, hairline borders, one blue."

### 1.2 The Semantic Token Architecture
Avoid hardcoding raw hex or HSL values in component styles. Use semantic CSS variables that resolve dynamically across themes:

| Token | Light Value | Dark Value | Semantic Purpose |
|---|---|---|---|
| `--background` | `hsl(40 30% 97%)` | `hsl(222 47% 6%)` | Root application canvas |
| `--foreground` | `hsl(220 45% 12%)` | `hsl(220 20% 92%)` | Primary text and headings |
| `--card` | `hsl(0 0% 100%)` | `hsl(220 35% 10% / 0.75)` | Elevated cards, panels, bottom sheets |
| `--primary` | `hsl(220 55% 18%)` | `hsl(215 85% 60%)` | Primary interactive buttons, key marks |
| `--primary-foreground` | `hsl(40 30% 97%)` | `hsl(222 47% 6%)` | Text rendered on primary surfaces |
| `--muted` | `hsl(40 15% 93%)` | `hsl(220 25% 14%)` | Subtle chip backgrounds, secondary tabs |
| `--muted-foreground` | `hsl(220 20% 28%)` | `hsl(220 15% 65%)` | Secondary meta text, hints, counters |
| `--border` | `hsl(220 15% 88%)` | `hsl(220 25% 22% / 0.6)` | Hairline dividers and container outlines |
| `--accent` | `hsl(215 85% 55%)` | `hsl(215 85% 60%)` | Highlights, active focus rings, badges |
| `--destructive` | `hsl(0 72% 51%)` | `hsl(0 72% 51%)` | Irreversible actions (delete doc/note) |

---

## 2. Spatial Scale, Layout & Viewport Density

### 2.1 The 4px Spacing Grid
All paddings, margins, gaps, and component heights align to multiples of 4px:
- `gap-1` (4px), `gap-2` (8px), `gap-3` (12px), `gap-4` (16px), `gap-6` (24px).
- **Control Heights:** Standard inputs and primary buttons standardized at `h-9` (36px) or `h-10` (40px); icon buttons at 32px or 36px.
- **Touch Target Floor:** On touch/pointer-coarse devices, interactive targets expand to $\ge 44\text{px} \times 44\text{px}$ to satisfy Apple HIG and WCAG 2.5.5 without inflating desktop visual density.

### 2.2 Corner Radii System
- Base unit `--radius = 0.75rem` (12px):
  - Tight chips and badges: `radius-sm` (8px / `rounded-md`).
  - Buttons and input fields: `radius-md` (10px).
  - Standard cards and floating panels: `radius-lg` (12px) or `radius-xl` (16px / `rounded-xl`).
  - Page sections and modal sheets: `rounded-2xl` (20px).

### 2.3 Viewport Density Clamping
To prevent oversized UI on high-resolution laptop screens (1470×956) while maintaining comfort on larger monitors (1710×1112):
```css
@media (max-width: 1580px) {
  html {
    font-size: clamp(13.754px, 0.934vw + 2.2px, 16px);
  }
}
```
Using `rem` units for typography and spacing allows the entire application shell to scale naturally while preserving relative visual proportions.

---

## 3. Typography Hierarchy & Contrast

### 3.1 Typeface Selection & Font Features
- **Primary UI Sans:** `Inter` (weights 300 to 700), with OpenType features activated:
  ```css
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  ```
  These feature flags enable open curved digits, simplified lowercase 'u' and 't', improving tabular legibility and scan speed.
- **Tabular & Code Mono:** `JetBrains Mono` or high-grade system monospaced stack for page counters (`Pg. 14/320`), timestamps, and keyboard shortcut badges (`⌘↵`).

### 3.2 Modular Scale
| Role | Size | Line Height | Tracking | Weight |
|---|---|---|---|---|
| **Display / Hero Title** | `1.75rem` (28px) | 1.2 | `-0.025em` | 600 Semi-Bold |
| **Page Title** | `1.53rem` (24.5px) | 1.25 | `-0.02em` | 500 Medium |
| **Section Head / Card Title** | `0.92rem` (14.7px) | 1.4 | `-0.01em` | 500 Medium |
| **Body Text / Annotations** | `0.85rem` (13.6px) | 1.6 | normal | 400 Regular |
| **Control Labels / Subtitles**| `0.79rem` (12.6px) | 1.35 | `+0.01em` | 400 Regular |
| **Micro Badges / Shortcuts** | `0.68rem` (11px) | 1 | `+0.05em` | 500 Medium Mono |

---

## 4. UI/UX Optimization in Folio Application Modules

### 4.1 Document Viewer Column & Canvas Aesthetics
- **Canvas Backdrop:** Centered column flanked by subtle shadow elevation (`shadow-md` or `shadow-elevated`), giving the digital PDF the tactile presence of an authentic document resting on a reading desk.
- **Reading Margins:** Dynamic horizontal margin calculation ensuring lines of text do not exceed 75–85 characters per line (optimal reading measure).

### 4.2 Details Panel (Notes, Highlights, Outline)
- **Unified Tabs:** Clear status indicators with subtle badge counts (`notes`, `highlights`, `outline`). Active tab underlined by a 2px blue accent pill.
- **Cards Hierarchy:** Card head with monospace page badge (`Pg. 12`), relative timestamp, and contextual actions (reply to highlight, delete). Highlight quotes styled with a subtle accent left border.
- **Inline Composer:** Sticky bottom container with auto-expanding textarea, keyboard shortcut hint (`⌘↵`), and direct highlight citation chips.

### 4.3 Active Recall Flashcard Deck
- **Card Motion:** Fluid flip transition using 3D perspective transforms with ease curves (`cubic-bezier(0.2, 0.8, 0.2, 1)`).
- **Grading Controls:** Four distinct rating buttons corresponding to SM-2 qualities (Again, Hard, Good, Easy), color-coded with subtle border glows and keyboard bindings (1, 2, 3, 4).

### 4.4 In-Document Search HUD
- Floating top-right HUD with backdrop blur, count badge, keyword highlighting in snippets, and keyboard navigation (Down/Up arrow selection, Enter to jump, Escape to dismiss).

---

## 5. Accessibility (a11y) & Interaction Polish

1. **Focus Rings:**
   Provide high-contrast, non-intrusive focus indicators:
   ```css
   :focus-visible {
     outline: 2px solid var(--accent);
     outline-offset: 2px;
   }
   ```
2. **Semantic ARIA Roles:**
   - Document scroll container: `role="document"` or `role="region"` with `aria-label="PDF Document Viewer"`.
   - Notes list: `role="feed"` or `role="list"` with children `role="listitem"`.
   - Active recall modal: `role="dialog"` with `aria-modal="true"`.
3. **Motion Sensitivity:**
   Always wrap ambient animations in `@media (prefers-reduced-motion: reduce)`.
