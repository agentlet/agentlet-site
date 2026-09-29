---
title: Scaffold an agentlet
description: Generate a working custom agentlet from a template.
---

This command creates a working demo agentlet named `my-agentlet` within `agentlet-core/../my-agentlet/`, pre-packaged with all required external libraries.

```bash
# Full template (comprehensive example with all API features)
npm run scaffold:agentlet:defaults

# Minimal template (simple starter, just 74 lines)
npm run scaffold:agentlet -- --minimal

# Interactive scaffolding (choose template and options)
npm run scaffold:agentlet
```

The minimal template provides a clean 74-line starting point with basic structure and `agentlet.Dialog` API usage, while the full template includes comprehensive examples of all framework features.

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

Source: agentlet-core README.md, section "Getting started", and plopfile.js and plop-templates/agentlet/ from agentlet-core 2.1.1.
