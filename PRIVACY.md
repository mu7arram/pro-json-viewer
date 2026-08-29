# Privacy Policy for Pro JSON Viewer

**Last Updated:** August 29, 2026  
**Extension:** Pro JSON Viewer  
**Developer:** [mu7arram](https://github.com/mu7arram)  

---

## Summary (TL;DR)

**Pro JSON Viewer is 100% private, offline, and client-side.**  
- **No data collection**: We do not collect, log, track, or share any of your data, browsing history, URLs, or JSON payloads.
- **No external network requests**: The extension operates entirely within your browser and makes zero outbound network requests.
- **No analytics or telemetry**: We use no third-party tracking scripts, cookies, or analytics services.

---

## 1. Information We Do NOT Collect

When you use Pro JSON Viewer, all processing, parsing, formatting, filtering, diffing, and rendering happen **strictly in your local browser memory**.

Specifically, Pro JSON Viewer **does NOT**:
- Read, store, or transmit your JSON payloads, API responses, or documents.
- Inspect or log your visited URLs, web requests, or browser history.
- Capture keystrokes, clipboard data, or search queries (except locally within the active page session to perform in-memory filtering and formatting).
- Use any external servers, cloud processing, or remote backend infrastructure.

---

## 2. Browser Permissions & Local Storage Use

Pro JSON Viewer requests the minimum necessary permissions to function:

| Permission / API | Purpose | Data Handled |
|---|---|---|
| `storage` (`chrome.storage.local`) | Saves your local UI preferences (e.g. selected theme, default expand depth, and feature toggles). | Stored strictly on your local device. Never synced or transmitted externally. |
| `contextMenus` | Adds an optional right-click shortcut to format selected JSON text in the local scratchpad. | Executed entirely in your local browser tab. |
| Content Scripts | Injected solely on web pages returning `application/json` or raw JSON text to render the interactive viewer UI. | Processed entirely in client-side memory; discarded when the tab is closed. |

---

## 3. Third-Party Services & Analytics

Pro JSON Viewer does **not** include any third-party analytics (such as Google Analytics, Mixpanel, or Sentry), advertising networks, or external CDN dependencies. All styling, icons, fonts, and scripts are bundled locally inside the extension package.

---

## 4. Open Source & Transparency

Pro JSON Viewer is open source. You can inspect the entire codebase, build scripts, and dependencies on GitHub:  
👉 [https://github.com/mu7arram/pro-json-viewer](https://github.com/mu7arram/pro-json-viewer)

---

## 5. Changes to This Policy

If we ever update this policy (e.g. to reflect new browser platform guidelines), the updated version will be published here with an updated "Last Updated" date.

---

## 6. Contact

If you have any questions or feedback regarding this Privacy Policy, please open an issue on GitHub:  
👉 [https://github.com/mu7arram/pro-json-viewer/issues](https://github.com/mu7arram/pro-json-viewer/issues)
