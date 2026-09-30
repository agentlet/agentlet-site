---
title: Scaffold an agentlet
description: Generate a working custom agentlet from a template.
---

This command creates a working demo agentlet named `my-agentlet` within `agentlet-core/../my-agentlet/`, pre-packaged with all required external libraries.

```bash
# Full template (comprehensive example with all API features)
npm run scaffold:agentlet:defaults

# Minimal template (simple starter)
npm run scaffold:agentlet -- --minimal

# Interactive scaffolding (choose template and options)
npm run scaffold:agentlet
```

The minimal template provides a short starting point with basic structure and `agentlet.Dialog` API usage, while the full template includes comprehensive examples of all framework features.

## Run it on any page

The scaffolded `src/index.js` resolves the registry (`agentlets-registry.js`) and the PDF.js worker against the URL the core bundle itself was loaded from, not against the host page. The bookmarklet served by `npm start` on `http://localhost:8080` therefore works on any origin, not only on the dev server page. The registry loads `module-bundle.js` and registers the module class its entry names, so `src/index.js` does not depend on the agentlet's name.

Projects scaffolded before agentlet-core 2.2.0 use relative URLs resolved against the host page. To run one on another origin, make `registryUrl` in `src/index.js` and the entry `url` in `dist/agentlets-registry.js` absolute.

## Choose the agentlet-core dependency

By default, the scaffolded project's `package.json` depends on the published npm package, `"agentlet-core": "^2.1.1"`. Pass `--core=local`, or answer "Local checkout" in the interactive prompt, to depend on this checkout instead, `"file:../<folder>"`. Local checkout is for developing agentlet-core itself alongside a scaffolded agentlet.

```bash
npm run scaffold:agentlet -- --core=local
```

## Run the custom agentlet

```bash
cd ../my-agentlet
npm install
npm run build
npm start
```

Source: agentlet-core README.md, section "Getting started", and plopfile.js and plop-templates/agentlet/ from agentlet-core 2.2.0 (ac57317).
