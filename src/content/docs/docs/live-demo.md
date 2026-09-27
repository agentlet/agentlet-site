---
title: Live demo
description: What you can try on agentlet.io, how it loads, and the rules the demos follow.
---

Most pages on this site, and every page under this docs section, carry a "Try it on this page" button (on the home page) or load an agentlet you already opened on a previous page. This page explains what that is and what it does.

## What you can try

Clicking "Try it on this page" opens a launcher panel listing the demo agentlets available on this site. Each one shows a short description and who it is aimed at (business, developers, or IT and security). Pick one to activate it in the same panel.

:::note
The demos are still being built. Until the first one ships, the launcher panel shows an honest empty state instead of a placeholder.
:::

## How it loads

Nothing related to the demo is downloaded until you click the button, not even the loader that drives the rest of the process. On click, the page loads:

- The demo loader, from `/cdn/v1/demo-loader.js`.
- `agentlet-core`, the framework itself, from `/cdn/v1/agentlet-core.min.js`.
- The demo registry, from `/cdn/v1/agentlets-registry.js`.
- The chosen demo agentlet's own script, from `/cdn/v1/agentlets/<name>.js`, once you pick it in the launcher.

Because this site does a full page load on every navigation, a tiny inline script on every page (not a separate request) checks whether you left the panel open on a previous page and, if so, loads the demo loader to reopen it. That check itself downloads nothing on its own: it only loads the demo loader if the panel was open.

## Rules the demos follow

- **No demo submits a form.** A demo may read a page's form, or fill one in locally so you can see the result, but it never submits it or sends data to a live backend.
- **Recorded AI response.** Any demo that shows an AI-generated reply labels it "Recorded AI response". The demos on this site do not call a live AI provider: what you see is a fixed answer recorded in advance, not a model reasoning about the specific page or file you gave it.
- **Closing the panel clears the state.** Closing the panel (its close button, not minimizing it) fully tears the demo down. Reopening it starts fresh.

## Source

Every demo agentlet is a single TypeScript file under `src/agentlets/` in the site's repository. Each one shows a "View the source of this agentlet" link in its own panel, pointing at that file on GitHub.

Source: this site's own live-demo feature (`src/agentlets/`, `src/scripts/demo-loader.ts`, `scripts/build-cdn.mjs`), not derived from agentlet-core's documentation.
