---
title: Manual setup
description: Build agentlet-core by hand without the demo or scaffold scripts.
---

```bash
cd agentlet-core
npm install
npm run build
```

This creates:

- `dist/agentlet-core.js`: development version (IIFE global, also usable via `require('agentlet-core')`)
- `dist/agentlet-core.esm.js`: ES module version, used by bundlers that `import` the package
- `dist/agentlet-core.min.js`: production version. Since 2.4.0 it no longer contains SheetJS, html2canvas and pdf.js: they are the separate files `dist/agentlet-xlsx.min.js`, `dist/agentlet-html2canvas.min.js` and `dist/agentlet-pdfjs.min.js`, loaded on first use from the folder of the core script. Serve them together, see [Install](/docs/getting-started/install/#where-the-files-are-loaded-from)
- `dist/agentlet-core.full.min.js`: since 2.4.0, the core with all three libraries inlined, as one file
- `dist/pdf.worker.min.mjs`, `dist/cmaps/` and `dist/standard_fonts/`: what pdf.js fetches while it converts a PDF
- `dist/bookmarklet.js`: bookmarklet version (carries all three libraries inline)
- `dist/bookmarklet.html`: installation page

From here, either:

- Open `dist/bookmarklet.html` to install the bookmarklet in your browser, then click it on a page you want to augment.
- Reference `dist/agentlet-core.js` or `dist/agentlet-core.esm.js` from your own build, and construct `AgentletCore` yourself. See [Public API](/docs/reference/public-api/) for the constructor configuration.
