---
title: Install
description: Install agentlet-core from npm, or clone and build it to contribute.
---

Install agentlet-core from npm:

```bash
npm install agentlet-core
```

This installs version 2.0.1, see it on [npm](https://www.npmjs.com/package/agentlet-core). The package ships `dist/agentlet-core.js` (IIFE global, also used by `require`), `dist/agentlet-core.min.js`, `dist/agentlet-core.esm.js`, and `dist/agentlet-core.d.ts`, about 1.4 MB compressed.

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

## Clone and build

To contribute to agentlet-core, clone and build it locally instead of installing the package:

```bash
git clone https://github.com/agentlet/agentlet-core.git
cd agentlet-core
npm install
npm run build
```

See [Manual setup](/docs/getting-started/manual-setup/) for what this produces, or [Quick demo](/docs/getting-started/quick-demo/) to run the built-in examples right away.

Source: agentlet-core README.md, sections "Getting started" and "Using agentlet-core as a package dependency", and src/index.ts and package.json from agentlet-core 2.0.1.
