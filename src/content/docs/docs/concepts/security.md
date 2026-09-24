---
title: Security
description: Content Security Policy, CORS, and registry loading considerations.
---

To address the security considerations introduced by running inside the context of an existing webpage, the agentlet framework adheres to common web and API security principles, notably Content Security Policy (CSP) and Cross-Origin Resource Sharing (CORS).

## Content Security Policy (CSP)

CSP headers restrict which domains can serve content within a page. Typically, this includes the domain hosting the web app, its APIs, and associated CDNs. In corporate environments, a common pattern is to deploy your AI API within an existing trusted domain and serve the agentlet, as minified JavaScript, from your corporate CDN. This approach enables the bookmarklet to inject code into the page, permitted if hosted on an allowed domain per CSP, and subsequently lets the agentlet interact with internal APIs.

## Cross-Origin Resource Sharing (CORS)

Your backend APIs must implement appropriate CORS headers to allow requests from the domain where the agentlet runs, typically your internal corporate web application.

## Registry loading

Agentlet registries use script injection instead of `fetch()` to avoid CORS issues when loading agentlet configurations. Registry files are JavaScript files (`.js`) that dispatch events with registry data, rather than JSON files that require CORS-compliant servers. This ensures reliable loading across corporate environments and CDNs.

For the full mechanism and migration notes, see [Script injection and registry](/docs/guides/script-injection/).

Source: agentlet-core README.md, section "Security considerations".
