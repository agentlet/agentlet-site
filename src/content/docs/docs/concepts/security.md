---
title: Security
description: What the host page can see, where API keys live, what data leaves the page, CSP, CORS and registry loading.
---

An agentlet is JavaScript injected into a page you do not control, by a bookmarklet, an extension or the page itself. It runs with the page's privileges, in the page's JavaScript context, and is not sandboxed. This page describes what that means in practice.

## What the host page can see

- **Everything the agentlet holds in memory.** `window.agentlet` is a global, so any other script on the page, including third-party analytics and any XSS payload, can read it.
- **Everything the agentlet stores.** Environment variables are persisted in the host origin's `localStorage` under the key `agentlet`, readable by any script on that origin.
- **The agentlet's network calls.** Other scripts on the page can wrap `fetch` and observe requests.

A module you register can do anything the page can do.

## API keys

`window.agentlet.ai` calls the provider straight from the browser and sends `OPENAI_API_KEY` as a bearer token. A key set this way is readable by every script on the host page.

Do not put a long-lived provider key in the browser on a page that loads third-party scripts or handles untrusted content. Instead:

1. **Use a proxy.** Set `OPENAI_BASE_URL` to an endpoint on your own backend that speaks the OpenAI API, and set `OPENAI_API_KEY` to a short-lived token your backend issued to the signed-in user. The backend checks that token, adds the real provider key and forwards the request. The real key never reaches the browser.
2. **Do not persist secrets.** Pass your own `envManager` to `new AgentletCore({ envManager })`, for example one that keeps values in memory only, or `envManager: null` to disable environment variables. See [Environment variables](/docs/guides/environment-variables/).
3. **Scope the key.** If a key must reach the browser, use a project key with a spending limit, and rotate it.

## Data sent to an AI provider

Agentlet sends no page data on its own and has no telemetry. A module sends what it passes to `window.agentlet.ai`: prompts, form structures, table data or screenshots of page elements. Review what your module captures before pointing it at pages with personal or customer data.

Since agentlet-core 2.3.0, form extraction reports `type="password"` fields with a `null` value and without their `value` attribute, so a password does not reach a prompt by accident. Pass `includePasswordValues: true` to override this when the extraction stays on the page, see [Form extraction](/docs/guides/forms-extraction/#password-fields). Other fields, including hidden ones when `includeHidden` is set, are reported as they are.

Up to agentlet-core 2.3.0, the only third-party request the core makes by itself is during PDF conversion, which downloads pdf.js character maps and standard fonts from cdnjs.cloudflare.com. The PDF content is not sent. Since 2.4.0 the core makes no third-party request by itself: it loads SheetJS, html2canvas and pdf.js on demand from the folder its own script was served from, and pdf.js reads its worker, character maps and standard fonts from that same folder (`pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/` in `dist/`). Set `libraryBaseUrl` to serve them from your own origin, see [Install](/docs/getting-started/install/#where-the-files-are-loaded-from).

The demos on this site do not call any AI provider. Their AI answers are recorded in advance, see [Live demo](/docs/live-demo/).

## Authentication popup

Since agentlet-core 2.3.0, the authentication manager only accepts messages from the login popup it opened, and checks their origin against `allowedOrigins` when that list is set. Set `allowedOrigins` to the origin of the page that posts the result back. A warning is logged when it is empty. See [Authentication](/docs/guides/authentication/#security-considerations).

## Content Security Policy (CSP)

CSP headers restrict which domains can serve content within a page. Typically, this includes the domain hosting the web app, its APIs, and associated CDNs. In corporate environments, a common pattern is to deploy your AI API within an existing trusted domain and serve the agentlet, as minified JavaScript, from your corporate CDN. The bookmarklet can then inject code into the page, because it is hosted on a domain the CSP allows, and the agentlet can call internal APIs.

Since agentlet-core 2.4.0, the core also loads SheetJS, html2canvas and pdf.js from the folder its own script was served from, so a `script-src` that allows the core script allows them too. The pdf.js worker is a module worker: when the policy sets `worker-src`, allow the same origin there as well.

A page with a strict policy blocks a bookmarklet loaded from any other origin. Use the extension or native integration modes there, see [Deployment modes](/docs/concepts/deployment-modes/). The agentlet panel writes markup with `innerHTML`, so it does not run on pages that enforce Trusted Types.

## Cross-Origin Resource Sharing (CORS)

Your backend APIs must implement appropriate CORS headers to allow requests from the domain where the agentlet runs, typically your internal corporate web application.

## Registry loading

Agentlet registries use script injection instead of `fetch()` to avoid CORS issues when loading agentlet configurations. Registry files are JavaScript files (`.js`) that dispatch events with registry data, rather than JSON files that require CORS-compliant servers. This ensures reliable loading across corporate environments and CDNs.

A registry and the modules it lists run with the page's privileges. Only load them from an origin you control.

For the full mechanism and migration notes, see [Script injection and registry](/docs/guides/script-injection/).

## Reporting a vulnerability

Report vulnerabilities privately, either through GitHub ([open a security advisory](https://github.com/agentlet/agentlet-core/security/advisories/new) on agentlet-core) or by email to [security@agentlet.io](mailto:security@agentlet.io). Please do not open a public issue.
