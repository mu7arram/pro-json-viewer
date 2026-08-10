# Pro JSON Viewer — Browser Extension Build Plan

## 1. Product Goal

Build a browser extension that auto-detects and renders JSON (from API responses, `.json` files, and pasted/raw text) with a fast, virtualized tree view. Priorities, in order: **speed/lightness**, **clarity**, **power-user features that competing JSON viewers lack**. No telemetry, no network calls — everything runs locally in the browser.

## 2. Target Browsers & Base Setup

- Manifest V3 (Chrome, Edge, and Firefox via a WebExtension polyfill or a framework like `wxt` that abstracts `chrome.*` vs `browser.*`)
- Language: TypeScript
- Rendering: vanilla DOM or Preact (avoid React/heavy frameworks — bundle size matters for the "light" positioning)
- Build tool: Vite (or `wxt`, a purpose-built extension framework, if you want manifest/bundling handled for you)
- No external runtime dependencies beyond what's needed for syntax highlighting/date parsing — keep the dependency tree small

## 3. Extension Architecture

- **manifest.json**: declare `permissions: ["storage"]`, `host_permissions` scoped as narrowly as possible, a background service worker, and a content script matching JSON responses
- **Background service worker**: listens for navigation/response events, detects `Content-Type: application/json`, and triggers the renderer to replace the default browser JSON view. Must be stateless/event-driven — don't rely on long-lived in-memory state since MV3 workers can be killed and restarted
- **Content script**: injects the tree view UI in place of the raw JSON when a JSON document is detected; runs in an isolated context, so use `postMessage` or `chrome.runtime` messaging if it ever needs to talk to page-level JS
- **Popup**: lightweight UI for settings shortcuts (theme toggle, "open JSON from clipboard/file") — keep this minimal, most interaction happens in the injected tree view itself
- **Options page**: persisted settings (theme, default expand depth, font size, whether to auto-activate on all JSON or only on click)

## 4. Feature Set

### 4.1 Baseline (must-have, table stakes)
- Auto-detect JSON responses and pretty-print with syntax highlighting
- Collapsible tree view (see 4.2 for detail)
- Copy value / copy key / copy JSONPath for any node
- Light/dark theme, following the browser/system preference by default

### 4.2 Tree View (core UI)
- Click anywhere on a row (not just a small arrow icon) to expand/collapse — larger hit target
- Keyboard navigation: arrow keys to move between rows, left/right to collapse/expand
- "Expand all" / "Collapse all" controls, plus "expand to depth N"
- Indent guides (subtle vertical lines) to keep deep nesting readable
- Type-based coloring for strings, numbers, booleans, null
- Collapsed nodes show inline summaries, e.g. `{ 12 items }` or `[ 5 items ]`, so users don't need to expand to know what's inside
- Optional line numbers, toggleable
- **Virtualized rendering**: only render DOM nodes for rows currently in viewport (windowing), so multi-MB JSON payloads stay smooth instead of freezing the tab
- **Lazy expansion**: children of a node are not recursively pre-rendered until the node is actually opened

### 4.3 Search & Query (differentiator)
- Instant search/filter box: type to filter keys/values, tree auto-expands to reveal matches, highlight matched text
- Optional regex mode
- JSONPath or jq-style query bar (e.g. `.data[].id`) that filters/highlights results live against the tree, not just a static read-only view

### 4.4 Diff Mode (differentiator)
- Paste or load a second JSON document and see a structural diff against the first (added/removed/changed keys and values highlighted in the tree)
- Useful for comparing API responses across environments or requests

### 4.5 Smart Value Detection (differentiator)
- Auto-linkify URLs found in string values
- Detect unix timestamps and ISO date strings, show a human-readable formatted date on hover
- Detect JWTs and base64-encoded strings, offer an inline "decode" toggle
- Show inferred types per node, and flag arrays whose items have inconsistent shapes (schema hinting)

### 4.6 View Modes
- Toggle between tree view and raw/pretty-printed text view
- Preserve scroll position / cursor context when switching between the two

### 4.7 Trust & Positioning
- Explicitly local-only processing, no network calls, no telemetry — surface this in the popup/options page as a stated guarantee, since users are often wary of tools handling sensitive API payloads

## 5. Performance Requirements

- Tree view must remain responsive (60fps scroll) on JSON payloads of at least 50MB via virtualization + lazy expansion
- Initial parse should happen off the main thread where feasible (e.g. a Web Worker for parsing very large payloads) so the tab doesn't freeze during load
- Bundle size budget: keep the injected content script small (target well under 200KB uncompressed) to reinforce the "light" positioning

## 6. Suggested Build Order (milestones)

1. **Scaffold**: manifest.json, build config (Vite/wxt), basic content script that detects JSON and dumps raw pretty-printed text
2. **Tree renderer v1**: non-virtualized recursive tree with expand/collapse, type coloring, copy actions
3. **Virtualization pass**: replace naive recursive render with a windowed/virtualized list; add lazy expansion
4. **Search/filter**: instant filter box with auto-expand-to-match and highlighting
5. **JSONPath breadcrumb + copy path**: clicking a node shows/copies its path
6. **Smart value detection**: dates, URLs, JWT/base64 decode
7. **Diff mode**: second-document loading + structural diff highlighting
8. **Polish**: themes, options page, keyboard nav, performance testing on large payloads
9. **Packaging**: test across Chrome/Edge/Firefox, prepare store listings, submit

## 7. Open Decisions to Make While Building

- Preact vs. pure vanilla DOM for the tree renderer
- Whether to auto-activate on every JSON response or require a click-to-activate toggle (privacy/perf trade-off)
- How much of the diff/query features to gate behind a "pro" tier vs. ship free, if monetization is a goal later
