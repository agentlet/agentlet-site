---
title: Install
description: Install agentlet-core from npm, or clone and build it to contribute.
---

Install agentlet-core from npm:

```bash
npm install agentlet-core
```

This installs version 2.3.0, see it on [npm](https://www.npmjs.com/package/agentlet-core). The package ships `dist/agentlet-core.js` (IIFE global, also used by `require`), `dist/agentlet-core.min.js`, `dist/agentlet-core.esm.js`, `dist/agentlet-core.d.ts`, and `dist/pdf.worker.min.mjs` (the matching pdf.js worker, see [Public API](/docs/reference/public-api/#agentletcoreconfig)). In the next release it also ships the files the core loads on demand, `dist/agentlet-core.full.min.js` and the pdf.js character maps and fonts, listed under [Size](#size). For a working page in two minutes, see the [Quick start](/docs/getting-started/quick-start/). The sizes are under [Size](#size).

## Works under Node

`require('agentlet-core')` and `import('agentlet-core')` load without a browser. Only `new AgentletCore().init()` needs one: pdf.js, the one dependency that touches browser globals, is not evaluated at import time. Up to 2.3.0 it was loaded inside `init()` and `window.pdfjsLib` was available once `init()` resolved. In the next release SheetJS, html2canvas and pdf.js are loaded the first time a feature needs them, see [Size](#size). This makes the package safe to import from server-side rendering, build tools, and tests.

`require('agentlet-core/package.json')` also works, for tooling that reads the package's own metadata.

## Import forms

```javascript title="ESM, resolves to dist/agentlet-core.esm.js"
// The default export is the class.
import AgentletCore from 'agentlet-core';
import { Dialog, FormExtractor } from 'agentlet-core';
```

```javascript title="CommonJS, resolves to dist/agentlet-core.js"
// Exposes the module namespace rather than the class itself, so read the
// class off `default`. This matches the browser global below.
const { default: AgentletCore } = require('agentlet-core');
```

```html title="Script tag"
<script src="node_modules/agentlet-core/dist/agentlet-core.js"></script>
<script>
  const core = new window.AgentletCore.default();
</script>
```

Named exports such as `Dialog`, `FormExtractor`, and `TableExtractor` work the same way on all three paths.

The package also ships hand-written TypeScript declarations for `window.agentlet`, the `Module` base class, and the core config, usable from both JavaScript and TypeScript agentlets. See [TypeScript](/docs/guides/typescript/).

## Size

Up to 2.3.0, the bundle is large, because html2canvas, pdf.js and SheetJS are included in it. Measured on agentlet-core 2.3.0:

| File | Size | Gzip |
|---|---|---|
| `dist/agentlet-core.min.js` | 1.38 MB | 398 KB |
| `dist/pdf.worker.min.mjs` (separate file, only needed for PDFs) | 1.04 MB | 286 KB |

The npm tarball is 1.8 MB, or 8.3 MB unpacked, because it also holds the unminified IIFE and ESM builds. In `agentlet-core.min.js`, by minified bytes, SheetJS is about 33%, pdf.js 29%, agentlet's own code 21% and html2canvas 16%. Every dependency is bundled into one file and none is loaded on demand, so a bookmarklet pays the full download on each page where it is used, and the browser may cache it between pages.

### In the next release

SheetJS, html2canvas and pdf.js are no longer inlined in the core. Each one is loaded the first time a feature needs it: the first Excel export, screenshot or PDF conversion. The package ships these files in `dist/`:

- `agentlet-core.js`, `agentlet-core.min.js` and `agentlet-core.esm.js`: the core alone.
- `agentlet-xlsx.min.js`, `agentlet-html2canvas.min.js` and `agentlet-pdfjs.min.js`: the three libraries, which the two IIFE builds load next to the core script. The ES module build reaches them through the ES modules in `dist/chunks/`, which a bundler turns into its own lazy chunks.
- `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`: what pdf.js fetches while it converts a PDF, from the same `pdfjs-dist` version as the bundled library. The core no longer requests anything from cdnjs.cloudflare.com.
- `agentlet-core.full.min.js`: the core with all three libraries inlined, as one self-contained file for hosts that cannot serve several files. It registers the libraries during `init()`, like the single file did before.

Sizes of the next release, minified, with gzip measured by `gzip -c file | wc -c`:

| File | Size | Gzip | Downloaded |
|---|---|---|---|
| `dist/agentlet-core.min.js` (the core alone) | 292 KB | 76 KB | | always |
| `dist/agentlet-xlsx.min.js` (SheetJS) | 503 KB | 162 KB | | first Excel export |
| `dist/agentlet-html2canvas.min.js` | 205 KB | 48 KB | | first screenshot |
| `dist/agentlet-pdfjs.min.js` (pdf.js) | 381 KB | 113 KB | | first PDF conversion |
| `dist/pdf.worker.min.mjs` | 1.04 MB | 286 KB | first PDF conversion |
| `dist/cmaps/` (169 files) and `dist/standard_fonts/` (16 files) | 1.17 MB and 0.78 MB in total | | only the files a PDF needs |
| `dist/agentlet-core.full.min.js` (everything inlined) | 1.39 MB | 401 KB | | always |

A page that never exports to Excel, captures the page or converts a PDF downloads 76 KB gzipped instead of 398 KB. The npm tarball is 3.2 MB, or 9.1 MB unpacked. The browser extension build and the generated bookmarklet carry all three libraries inline.

### Where the files are loaded from

The IIFE builds resolve every on-demand file relative to the URL of the core script itself. A host that serves the files of `dist/` together, whether it loads the core from a CDN with a `<script>` tag or from its own server, needs no setting. The script tag the core injects has no `crossorigin` attribute, so the server needs no CORS headers beyond what the core script itself needs. Set these `AgentletCore` options when the files live elsewhere:

| Option | Use |
|---|---|
| `libraryBaseUrl` | Folder URL that serves the chunk files, `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`. Needed when the core is evaluated without a script URL (a `fetch()` plus `eval()` loader), is bundled into the host's own script, or the files are served from another place. Falls back to the folder of `registryUrl`, then to the extension root inside a browser extension. |
| `libraryUrls` | URL of a single library file, for example `{ xlsx: 'https://static.example.com/sheetjs.js' }`. |
| `pdfWorkerUrl` | URL of `pdf.worker.min.mjs`. |
| `pdfCMapUrl`, `pdfStandardFontsUrl` | URL of the folder with the character maps or the standard fonts. |
| `preloadLibraries` | `['xlsx', 'html2canvas', 'pdfjs']`, or a subset: load them while `init()` runs instead of on first use. |

A failed load rejects with the URL it tried and the option to change. The ES module build needs neither of the first two: `import()` resolves its chunks relative to the module, and a bundler handles them like any other lazy import. The pdf.js files are plain files, not modules: copy `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/` to where the app serves its assets and point `pdfWorkerUrl`, `pdfCMapUrl` and `pdfStandardFontsUrl` at them. The full list of options is in the [Public API](/docs/reference/public-api/#agentletcoreconfig).

`window.XLSX`, `window.html2canvas` and `window.pdfjsLib` are no longer defined right after `init()`, unless you list them in `preloadLibraries` or use `agentlet-core.full.min.js`. The asynchronous APIs (`tables.download()`, `ScreenCapture`, `ai.convertPDFToImages()` and the others) load what they need themselves. The synchronous `createExcelWorkbook()` on the table extractor needs SheetJS loaded first: call `await window.agentlet.tables.extractor.ensureXLSX()` or preload `xlsx`.

## Clone and build

To contribute to agentlet-core, clone and build it locally instead of installing the package:

```bash
git clone https://github.com/agentlet/agentlet-core.git
cd agentlet-core
npm install
npm run build
```

See [Manual setup](/docs/getting-started/manual-setup/) for what this produces, or [Quick demo](/docs/getting-started/quick-demo/) to run the built-in examples right away.
