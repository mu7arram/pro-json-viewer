# Build Instructions for Pro JSON Viewer (Mozilla AMO Review)

This document provides step-by-step instructions to reproduce and verify the exact build artifact for **Pro JSON Viewer v2.1.0** from this source package.

---

## 1. Environment & Prerequisites

- **Operating System:** macOS, Linux, or Windows (WSL / PowerShell)
- **Node.js:** Node 18.x or higher (Tested on Node v20.x and v24.x)
- **Package Manager:** npm 9.x or higher (Tested with npm 11.6.2)

To verify your environment:
```bash
node -v
npm -v
```

---

## 2. Dependencies Installation

Extract the source zip archive into a clean directory and run:

```bash
npm install
```

This installs all devDependencies required for bundling (`vite`, `typescript`, etc.).

---

## 3. Build the Firefox Extension

To generate the exact Firefox extension distribution package, run:

```bash
npm run build:firefox
```

### What this build command executes:
1. `node scripts/generate-icons.js`: Generates the standard PNG icons from source assets.
2. `npx vite build`: Transpiles TypeScript source code and bundles the popup and options pages using Vite with the `TARGET_BROWSER=firefox` environment variable.
3. Automatically applies the Firefox-specific configuration from `manifest.firefox.json` to `dist/manifest.json`.
4. Packages the contents of `dist/` into `pro-json-viewer-firefox-v2.1.0.zip`.

---

## 4. Verification

After the build completes:
- The compiled add-on is located in the `dist/` directory.
- The zip file `pro-json-viewer-firefox-v2.1.0.zip` is created at the root directory.
- You can inspect the compiled output or load `dist/manifest.json` directly into Firefox via `about:debugging#/runtime/this-firefox` > **"Load Temporary Add-on…"**.
