---
title: Introduction
description: What agentlet is and how it augments existing web applications.
---

agentlet-core injects a side panel into a web app you cannot change. You load it with a bookmarklet, a browser extension, or from the app itself, and write small page-specific tools on top of it that read and fill forms, export tables to Excel, capture parts of the page as images, and call an AI model.

Nothing changes on the application's server. A backend or proxy is only needed for the AI model, if you use one.

Agentlet offers three deployment approaches: bookmarklets for instant deployment, browser extensions for enhanced capabilities, and native integration for applications that can embed the framework directly. Each approach delivers the same core augmentation capabilities while adapting to different technical environments and constraints.

## Where to go next

- **[Getting started](/docs/getting-started/quick-start/)**: a quick start from npm or a CDN bookmarklet with no clone, then install options, the built-in demo, scaffolding your own agentlet, generating one with Claude Code, or manual setup.
- **[Concepts](/docs/concepts/approach/)**: the philosophy behind agentlet, its architecture, deployment modes, and security model.
- **[Guides](/docs/guides/forms-extraction/)**: task-oriented documentation for forms, tables, AI, authentication, environment variables, dialogs, shadow DOM, the mount API, TypeScript, script injection, and z-index layering.
- **[Reference](/docs/reference/public-api/)**: the full `window.agentlet` public API, organized by namespace.
- **[Contributing](/docs/contributing/commit-rules/)**: commit message rules and the documentation style guide for this project.

## What agentlet is for

Agentlets are tactical tools: they let teams rapidly improve processes, test ideas, or temporarily enhance applications while waiting for more robust, long-term solutions. They favor speed over perfection, and are not meant to replace deeper system integrations.

The agentlet ecosystem includes the core framework (`agentlet-core`), example implementations, and [`agentlet-designer`](https://github.com/agentlet/agentlet-designer), which generates custom agentlets from a live page. Today it is a Claude Code skill (see [Generate with Claude Code](/docs/getting-started/generate-with-claude-code/)). An in-page designer agentlet is planned.
