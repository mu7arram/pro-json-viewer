# Pro JSON Viewer — Chrome Web Store Listing Metadata & Documentation

**Last Updated**: 2026-08-22  
**Version**: 1.9.0  
**Status**: Ready for Packaging & Submission  

---

## 1. Store Listing Metadata

### Name
Pro JSON Viewer

### Short Description (max 132 chars)
Fast, virtualized Manifest V3 JSON viewer with dual-editor diff suite, adaptive toolbars, schema health auditor, and dev tools.

### Detailed Description
Pro JSON Viewer transforms raw browser JSON responses, API payloads, and `.json` documents into an ultra-fast, virtualized, interactive tree view designed for developers and power users.

**Key Features:**
- 🔀 **Full Dual-Editor Side-by-Side Diff Suite**: Dedicated two-column comparison studio with live syntax validation, one-click dual formatting (`✨ Format Both`), side swapping (`🔄 Swap Sides`), and an expandable color-coded visual diff tree (`+ Added`, `- Removed`, `~ Modified`).
- 🧭 **Contextual Adaptive Toolbars**: Persistent 2-tier toolbar layout that dynamically swaps contextual controls (Search & dynamic depth for Tree, Beautify/Minify/Wrap for Raw, view indicators for Table/Chart/Diagram/Diff) without visual clutter.
- 📐 **Dynamic JSON Depth Detection**: Automatically computes the exact nesting hierarchy depth of any document, dynamically bounding depth buttons (`D1..D{max}`) across Tree, Diagram, Table, and Chart views.
- 🩺 **Schema Health & Anomaly Inspector**: Automated schema drift and data quality audits for API array payloads. Computes compliance health scores (0–100%), detects polymorphic type inconsistencies (e.g. `int` vs `string`), identifies missing required properties, tracks presence & null rates, and exports markdown audit reports.
- ⚡ **Web Worker Off-Thread Parser (50MB+)**: Deserializes and traverses massive multi-megabyte payloads off the main thread with zero browser tab freezing and silky smooth 60fps UI responsiveness.
- ⏳ **Glassmorphism Progress Loader**: Live progress indicator for large payloads with animated spinner, dynamic byte counters, and parse benchmark timer.
- ⌨️ **Keyboard Shortcuts & Power-User Suite**: Instant hotkeys for view switching (`Alt/Option + 1..6`), search focus (`/` or `Cmd/Ctrl+F`), tree expansion (`e`/`c`), developer tools (`t`), and interactive cheatsheet modal (`?`).
- 📷 **Visual Chart Image Exporters**: Export Donut, Vertical Bar, and Horizontal Bar charts into vector SVG, high-resolution 2x Retina PNG, or direct clipboard copy for instant sharing.
- 🗺️ **Interactive Diagram & Hierarchy Graph**: Visual graph explorer with zoom, pan, depth-based expansion, search filtering, orientation toggle, and pure SVG / high-resolution PNG exports.
- ⚡ **High-Performance Virtualization**: Smooth 60fps windowed scrolling for large multi-megabyte JSON responses without tab freezes.
- 🛠️ **Developer Tools Suite**: One-click TypeScript interface & Zod validation schema generator with copy and `.d.ts` / `.ts` download options.
- 💾 **Multi-Format Exporter**: Export JSON payloads into RFC 4180 CSV spreadsheets, clean YAML documents, and formatted or minified JSON files.
- 📊 **Real-Time Payload Stats Toolbar Badge**: Instant metrics displaying payload size, max nesting depth, total keys, and deserialization benchmarks with direct navigation to the Analytics dashboard.
- 🔍 **Instant Search & JSONPath**: Filter keys, values, or run complex JSONPath queries (`$.data[*].id`) with real-time text highlighting and auto-expanding match trees.
- 📊 **Tabbed Table View**: Automatically converts arrays into interactive sortable tables with magnetic scan depth controls (1–20 levels) and context-aware sub-array cell badges.
- 📈 **Visual Chart Dashboard**: Interactive SVG analytics dashboard featuring Donut/Pie charts, Vertical & Horizontal Bar charts, string category aggregations (*Count by Category*), label/value column pickers, Top-N filtering, and Min/Max/Avg/Sum summary cards.
- 💡 **Smart Value Decoders**: Auto-detects and displays inline decoders for ISO dates, Unix timestamps, JWT tokens, URLs, Base64 strings, and array schema anomalies.
- 🎨 **Modern Themes**: Sleek theme preset engine (Dracula, One Dark, Monokai, Nord, GitHub Dark/Light, Slate) with instant live storage sync and quick toolbar switcher.
- 🔒 **100% Local & Private**: Completely offline processing. Zero external network requests, zero analytics, zero telemetry.

---

## 2. Permissions Justification

| Permission | Scope / Use Case | Plain-English Justification |
|------------|------------------|-----------------------------|
| `storage` | Local Extension Storage | Needed to persist user UI preferences (theme, expand depth, smart decoders toggles) and offline scratchpad drafts. |
| `contextMenus` | Context Menu Items | Allows users to right-click selected JSON text on any web page to format and open it directly in the Pro JSON Scratchpad. |

---

## 3. Privacy & Data Use Disclosure

- **Single Purpose**: Formats, parses, and provides search/diff tools for JSON documents rendered in the user's browser.
- **Data Collection**: **NONE**. No user data, URLs, or JSON contents are collected, stored externally, or transmitted across the network. All processing happens entirely within the browser client.

---

## 4. Version History

### Version 1.9.0 (2026-08-22)
- Added **Full Dual-Editor Side-by-Side Diff Suite (`DiffView`)**: Dedicated full-viewport comparison studio replacing the modal. Features editable Left (Baseline) and Right (Target) editors with real-time character/line counters.
- Added **Live Real-Time Syntax Validation**: Instant syntax checking in both Diff editors with color-coded status pills (`✓ Valid JSON` / `⚠️ Invalid`) and line-error banners.
- Added **Visual Diff Tree Inspector**: Interactive highlighted tree with color-coded additions (`+ Added` green), deletions (`- Removed` red), and modifications (`~ Modified` amber with old $\rightarrow$ new values) plus Diff filter tabs (All, Added, Removed, Modified).
- Added **One-Click Diff Actions**: `✨ Format Both` (2-space dual formatting), `🔄 Swap Sides` (instant Left $\leftrightarrow$ Right exchange), and `📋 Sample` payload loader.
- Added **Contextual 2-Tier Adaptive Toolbars (`Toolbar`)**: Clean global top tier for view switching and utilities; contextual bottom sub-toolbar adapting dynamically per active view mode (Tree, Raw, Table, Chart, Diagram, Diff).
- Added **Dynamic Document Max-Depth Detection (`getJsonMaxDepth`)**: Automatically computes exact maximum hierarchy depth, dynamically bounding `D1..D{max}` buttons across Tree and Diagram views, and bounding magnetic sliders in Table and Chart views.
- Added **Raw View Editor Controls**: One-click `✨ Beautify` (2 spaces), `📦 Minify` (compact 1-line), and `↩️ Word Wrap` editor controls.
- Added **Complete Vitest Automated Test Suite**: 11 unit test suites covering 39 unit tests for all core engines, views, and worker bridge (100% green).
- Added **Schema Structure & Anomaly Health Inspector Panel (`SchemaHealthEngine`)**: Automated data quality auditor discovering array collections, calculating property presence and null rates, and pinpointing individual record anomalies.
- Added **Polymorphic Type Drift Detection**: Flags fields with mixed data types across records (e.g., numbers stored as strings).
- Added **Missing Required Property Detection**: Highlights rows missing dominant schema fields.
- Added **Compliance Health Score (0–100%)**: Weighted health dial badge categorizing collections as Healthy (`🟢 EXCELLENT`), Warning (`🟡 WARNING`), or Anomaly (`🔴 CRITICAL`).
- Added **Dedicated Scrollable Property Table**: Sticky column headers and smooth dedicated vertical scrolling for inspecting payloads with dozens of fields.
- Added **Markdown Audit Report Exporter**: One-click copy or download of formatted Markdown reports for GitHub issues or Jira tickets.
- Enhanced **Scratchpad Live Sync**: Seamless two-way re-parsing when editing JSON in Raw mode.
- Enhanced **Stats Badge Navigation**: Clicking toolbar stats badge jumps straight to the 📊 Analytics tab.
- Added **Web Worker Off-Thread Parser (`worker-bridge`)**: Background worker thread for parsing and flattening large JSON responses (50MB+) without UI blocking.
- Added **Glassmorphism Progress Loader (`ProgressLoader`)**: Animated progress card displaying live byte counters, parsing stages, and execution benchmark timers for large payloads.
- Maintained **60fps UI Responsiveness**: Zero tab freezing or scrolling lag during heavy JSON deserialization.

### Version 1.6.0 (2026-08-18)
- Added **Keyboard Shortcuts & Power-User Suite (`KeyboardShortcuts`)**: Full keyboard navigation across all views (`Alt/Option + 1..6`), instant search focus (`/` or `Cmd/Ctrl+F`), tree expansion (`e`/`c`), dev tools (`t`), and interactive cheatsheet modal (`?`). Full macOS `Option` key compatibility.
- Added **Chart View Vector SVG & High-Res PNG Exporters**: Download visual charts as standalone vector SVG or high-resolution PNG image files with summary stats and styled backgrounds.
- Added **Chart Clipboard Copy**: Instant one-click image copy (`📋 Copy`) for pasting directly into Jira, Slack, GitHub, or documentation.

### Version 1.5.0 (2026-08-17)
- Added **Interactive Diagram View (`DiagramView`)**: Visual hierarchy graph for exploring complex JSON relationships.
- Added **Zoom, Pan & Orientation Controls**: Smooth canvas navigation with zoom in/out, fit-to-screen, and horizontal/vertical layout orientations.
- Added **Node Search & Highlighting**: Find nodes across deep hierarchies with real-time text matching and auto-expansion.
- Added **Pure Vector SVG & PNG Exporter**: Export diagram graphs to clean vector SVG and high-resolution PNG image files without tainted canvas security errors.

### Version 1.4.0 (2026-08-16)
- Added **Developer Tools Suite (`ToolsModal`)**: Dedicated modal offering TypeScript interface generation, Zod validation schema generation, YAML/CSV conversion, and payload analytics.
- Added **TypeScript Interface Generator**: Incurs property types, handles nested objects and arrays, and outputs clean `.d.ts` definitions.
- Added **Zod Validation Schema Generator**: Generates valid `zod` validation schemas with nullable and optional modifiers.
- Added **Multi-Format Exporter**: One-click copy and downloads for RFC 4180 CSV tables, clean YAML, formatted JSON, and minified JSON.
- Added **Payload Stats Toolbar Badge**: Real-time toolbar indicator displaying payload byte size, maximum nesting hierarchy depth, total keys, and parse benchmarks.

### Version 1.3.0 (2026-08-15)
- Added **Interactive Visual Chart View (`ChartView`)**: Zero-dependency SVG analytics dashboard auto-generating Donut/Pie and Bar charts from JSON payloads.
- Added **Dynamic Column Pickers & Chart Type Switcher**: Interactively select Label Column, Value Column, and toggle between Donut, Vertical Bar, and Horizontal Bar charts.
- Added **String Category Aggregations ("Count by Category")**: Group items by string fields (e.g. `status`, `type`, `department`) and plot frequency counts.
- Added **Smart ID Field Filtering**: Excludes primary keys, timestamps, and codes from numerical chart metrics.
- Added **Min/Max/Avg/Sum Summary Cards & Top-N Filtering**: Quick statistical highlights and item count limits for clean visual reports.
- Added **Magnetic Scan Depth Slider for Chart View**: Smooth 1-to-20 level depth slider for discovering deeply nested chartable sub-arrays.

### Version 1.2.0 (2026-08-14)
- Added **Tabbed Data Dashboard in Table View**: Auto-discovers sub-arrays across nested levels and organizes them into tabbed tables.
- Added **Context-Aware Sub-Array Badges**: Interactive `(View)` badges in table cells allowing one-click opening of nested array tables.
- Added **Merged `❓ All Questions` Tab**: Combines questions across parent objects for unified analytical comparison.
- Added **Magnetic Dot Slider**: 20-step magnetic depth selector with floating hover tooltips for configurable scanning depth.

### Version 1.1.0 (2026-08-12)
- Added **Theme Preset Engine**: Dracula, One Dark Pro, Monokai Pro, Nord, GitHub Dark, GitHub Light, Slate Dark, and Clean Light.
- Added **Quick Toolbar Theme Switcher**: Change themes on-the-fly directly inside the active viewer toolbar.
- Added **Live Storage Sync**: Theme changes update all active browser tabs instantly without page refresh.
- Added **Context-Sensitive Fast Double-Click Copy**: Double-click keys or values specifically to copy them.
- Added **Hover Quick Action Buttons**: Copy Value, Key, or JSONPath directly on row hover.
- Added **Rich Snippet Toast Notifications**: Displays exact copied text snippets in feedback popups.

### Version 1.0.0 (2026-08-09)
- Initial release featuring DOM virtualized tree rendering, search/JSONPath engine, smart date/JWT decoders, diff comparison mode, popup quick controls, and standalone scratchpad.
