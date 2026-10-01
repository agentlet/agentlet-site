---
title: Install
description: Install agentlet-core from npm, or clone and build it to contribute.
---

Install agentlet-core from npm:

```bash
npm install agentlet-core
```

This installs version 2.2.0, see it on [npm](https://www.npmjs.com/package/agentlet-core). The package ships `dist/agentlet-core.js` (IIFE global, also used by `require`), `dist/agentlet-core.min.js`, `dist/agentlet-core.esm.js`, `dist/agentlet-core.d.ts`, and `dist/pdf.worker.min.mjs` (the matching pdf.js worker, see [Public API](/docs/reference/public-api/#agentletcoreconfig)). For a working page in two minutes, see the [Quick start](/docs/getting-started/quick-start/). The sizes are under [Size](#size).

## Works under Node

`require('agentlet-core')` and `import('agentlet-core')` load without a browser. Only `new AgentletCore().init()` needs one: pdf.js, the one dependency that touches browser globals, is loaded lazily inside `init()` instead of at import time. `window.pdfjsLib` is available once `init()` resolves, same as before. This makes the package safe to import from server-side rendering, build tools, and tests.

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

The bundle is large, because html2canvas, pdf.js and SheetJS are included in it. Measured on agentlet-core 2.2.0:

| File | Size | Gzip |
|---|---|---|
| `dist/agentlet-core.min.js` | 1.30 MB | 378 KB |
| `dist/pdf.worker.min.mjs` (separate file, only needed for PDFs) | 1.04 MB | 286 KB |

The npm tarball is 1.8 MB, or 7.9 MB unpacked, because it also holds the unminified IIFE and ESM builds. In `agentlet-core.min.js`, by minified bytes, SheetJS is about 33%, pdf.js 29%, agentlet's own code 21% and html2canvas 16%. Every dependency is bundled into one file and none is loaded on demand, so a bookmarklet pays the full download on each page where it is used, and the browser may cache it between pages.

## Clone and build

To contribute to agentlet-core, clone and build it locally instead of installing the package:

```bash
git clone https://github.com/agentlet/agentlet-core.git
cd agentlet-core
npm install
npm run build
```

See [Manual setup](/docs/getting-started/manual-setup/) for what this produces, or [Quick demo](/docs/getting-started/quick-demo/) to run the built-in examples right away.
