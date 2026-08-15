# Pro JSON Viewer — Chrome Web Store Listing Metadata & Documentation

**Last Updated**: 2026-08-15  
**Version**: 1.3.0  
**Status**: Ready for Packaging & Submission  

---

## 1. Store Listing Metadata

### Name
Pro JSON Viewer

### Short Description (max 132 chars)
Fast, virtualized Manifest V3 JSON viewer with instant search, JSONPath, smart decoders, table mode, and visual charts.

### Detailed Description
Pro JSON Viewer transforms raw browser JSON responses, API payloads, and `.json` documents into an ultra-fast, virtualized, interactive tree view designed for developers and power users.

**Key Features:**
- ⚡ **High-Performance Virtualization**: Smooth 60fps windowed scrolling for large multi-megabyte JSON responses without tab freezes.
- 🔍 **Instant Search & JSONPath**: Filter keys, values, or run complex JSONPath queries (`$.data[*].id`) with real-time text highlighting and auto-expanding match trees.
- 📊 **Tabbed Table View**: Automatically converts arrays into interactive sortable tables with magnetic scan depth controls (1–20 levels) and context-aware sub-array cell badges.
- 📈 **Visual Chart Dashboard**: Interactive SVG analytics dashboard featuring Donut/Pie charts, Vertical & Horizontal Bar charts, string category aggregations (*Count by Category*), label/value column pickers, Top-N filtering, and Min/Max/Avg/Sum summary cards.
- 💡 **Smart Value Decoders**: Auto-detects and displays inline decoders for ISO dates, Unix timestamps, JWT tokens, URLs, Base64 strings, and array schema anomalies.
- 🔀 **Structural Diff Mode**: Compare two JSON payloads side-by-side or inline to spot added, removed, or modified keys instantly.
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
