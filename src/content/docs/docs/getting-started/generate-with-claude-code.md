---
title: Generate with Claude Code
description: Let Claude Code build, inject and verify an agentlet for a live page.
---

[agentlet-designer](https://github.com/agentlet/agentlet-designer) is a
Claude Code skill that builds an agentlet for a page you point it at. You
give a URL and a goal. It returns a working agentlet and a bookmarklet.

The skill works in six steps:

1. **Observe.** It opens the page in a headless browser and lists its forms, fields, tables, pagination and buttons, with unique selectors.
2. **Design.** It states the agentlet it will build: one goal, two or three buttons, and how each will be checked.
3. **Scaffold.** It runs agentlet-core's own generator (the minimal template) and makes the project injectable into any origin.
4. **Implement.** It writes the module against the `window.agentlet` API.
5. **Verify.** It injects the agentlet into the real page the way the bookmarklet does, runs a Playwright scenario, and checks the effect on the page: form values set, Excel file content, messages shown, no console errors.
6. **Deliver.** It returns a screenshot, the bookmarklet and a short summary.

## Requirements

- Node.js 20 or later, and Python 3 to serve the demo apps.
- [Claude Code](https://claude.com/claude-code).
- `agentlet-core` and `agentlet-demo-apps` cloned next to `agentlet-designer`.

```bash
git clone https://github.com/agentlet/agentlet-core.git
git clone https://github.com/agentlet/agentlet-demo-apps.git
git clone https://github.com/agentlet/agentlet-designer.git
cd agentlet-designer
npm install
npx playwright install chromium
```

## Generate an agentlet for a demo app

Serve the demo apps:

```bash
python3 -m http.server 8000 --directory ../agentlet-demo-apps
```

In another terminal, from `agentlet-designer`:

```bash
claude "Create an agentlet for http://localhost:8000/crm/index.html that exports the customer table to Excel and prefills the new customer form"
```

The first run builds a cache of the core bundle, which takes about a
minute. After that, each new agentlet is scaffolded in about a second.

The result lands in `workspace/<name>/`: the module in `src/module.js`,
the verification scenario in `verify.mjs`, and a bookmarklet page in
`dist/index.html`.

## Use the generated agentlet

Keep the agentlet server running (the skill prints the exact command), drag
the bookmarklet from `workspace/<name>/dist/index.html` to your bookmarks
bar, open the target page and click the bookmarklet.

For a standalone production build:

```bash
cd workspace/<name>
npm install
npm run build
```

## Run the scripts yourself

The skill's scripts also work without Claude Code:

```bash
node skills/create-agentlet/scripts/observe.mjs --url http://localhost:8000/crm/index.html
node skills/create-agentlet/scripts/prepare.mjs crm-helper
node skills/create-agentlet/scripts/serve.mjs workspace/crm-helper/dist 8080
node skills/create-agentlet/scripts/inject.mjs --url http://localhost:8000/crm/index.html --module crm-helper --headed --keep
```

Source: agentlet-designer README.md and `skills/create-agentlet/SKILL.md`.
