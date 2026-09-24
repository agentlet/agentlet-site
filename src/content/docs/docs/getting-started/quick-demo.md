---
title: Quick demo
description: Run the built-in agentlet-core examples.
---

The fastest way to try agentlet is to run the built-in examples from the core repository.

```bash
git clone https://github.com/agentlet/agentlet-core.git
cd agentlet-core
npm install
npm run demo
```

This automatically:

- Builds the agentlet-core library
- Starts a development server on `http://localhost:3000`
- Opens your browser to the examples page
- Serves all examples with proper CORS headers for bookmarklet testing

Alternative commands that do the same thing:

```bash
npm run examples
npm start
```

To start the server without rebuilding the library first:

```bash
npm run dev
```

Source: agentlet-core README.md, section "Getting started".
