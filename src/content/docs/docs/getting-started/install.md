---
title: Install
description: Clone agentlet-core and build it, or install the future npm package.
---

import { Aside } from '@astrojs/starlight/components';

agentlet-core is not yet published to npm. Today, install it by cloning the repository and building it locally.

## Clone and build

```bash
git clone https://github.com/agentlet/agentlet-core.git
cd agentlet-core
npm install
npm run build
```

This creates:

- `dist/agentlet-core.js`: development version (IIFE global, also usable via `require('agentlet-core')`)
- `dist/agentlet-core.esm.js`: ES module version, used by bundlers that `import` the package
- `dist/agentlet-core.min.js`: production version
- `dist/bookmarklet.js`: bookmarklet version
- `dist/bookmarklet.html`: installation page

<Aside type="note">
  The `agentlet-core` npm package is not published yet. Once it is,
  `npm install agentlet-core` will work as described below.
</Aside>

## Future: install as a package dependency

As of version 2.0.0, the package ships the built `dist` output instead of raw `src` sources. Once published, install it like any other npm dependency:

```bash
npm install agentlet-core
```

```javascript title="Resolves to dist/agentlet-core.esm.js"
// The default export is the class.
import AgentletCore from 'agentlet-core';
import { Dialog, FormExtractor } from 'agentlet-core';
```

```javascript title="Resolves to dist/agentlet-core.js"
// Exposes the module namespace rather than the class itself, so read the
// class off `default`. This matches the browser global, where the class is
// `window.AgentletCore.default`.
const { default: AgentletCore, Dialog } = require('agentlet-core');
```

Named exports such as `Dialog`, `FormExtractor`, and `TableExtractor` behave identically on both paths.

Consumers will not need their own bundler rule to transpile `agentlet-core`'s sources (for example a `babel-loader` rule targeting `node_modules/agentlet-core`): the package is pre-built, so a bundler only needs to resolve and include it as-is.

The package also ships hand-written TypeScript declarations for `window.agentlet`, the `Module` base class, and the core config, usable from both JavaScript and TypeScript agentlets. See [TypeScript](/docs/guides/typescript/).

Source: agentlet-core README.md, sections "Getting started" and "Using agentlet-core as a package dependency".
