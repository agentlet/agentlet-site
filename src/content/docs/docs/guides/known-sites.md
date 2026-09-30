---
title: Known-site demos
description: How the agentlet demos for Wikipedia and other well-known sites are built, hosted on jsDelivr, versioned and extended.
---

The [known-sites page](/try/known-sites/) offers one bookmarklet that runs small agentlets on sites this project does not control. This page explains how they are built and hosted, and how to add a site. The code is in `src/agentlets/known-sites/`, the build script is `scripts/build-known-sites.mjs`, and the published package is `packages/agentlet-demos/`.

These demos are separate from the [live demo](/docs/live-demo/) on agentlet.io. That one loads from `/cdn/v1/` on this site and only works on agentlet.io. Nothing about it changed.

## Why jsDelivr

A bookmarklet runs inside someone else's page, so that page's Content Security Policy decides what it may load. Wikipedia's policy allows scripts from `*.jsdelivr.net` and from localhost, and does not allow agentlet.io. So the demos are published as an npm package, `@agentlet/demos`, and served by jsDelivr, which serves any npm package. agentlet-core itself is not copied into that package: the loader takes it from jsDelivr too, from the `agentlet-core` package.

This is also the limit of the approach. A site whose policy does not allow jsDelivr, or does not allow inline scripts at all, cannot run the bookmarklet. On 30 September 2026:

- Wikipedia allows it.
- arXiv allows it: it sends only `frame-ancestors 'none'`, with no script-src.
- GitHub, MDN, Stack Overflow and YouTube do not allow inline scripts without a nonce or hash, so even the bookmarklet's own code is refused.
- Hacker News allows inline scripts but limits loaded scripts to itself, Google reCAPTCHA and cdnjs, so the script from jsDelivr is refused. It is an example of a site that restricts scripts to its own domain and a few others. It has no demo here.

Policies change, so check the real page before relying on a site. `tests/e2e/fixtures/known-sites/` keeps the policies Wikipedia and arXiv sent, and the tests apply them.

## What the bookmarklet does

The bookmarklet adds one classic script tag that points at `https://cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js`. A classic script needs no CORS, and the `@1` range means a fix released as 1.0.1 reaches everyone without dragging a new bookmark.

The loader then:

1. Bakes in, at build time, the exact version of `@agentlet/demos` and of `agentlet-core` (read from `node_modules/agentlet-core/package.json`).
2. Loads `agentlet-core@<exact>/dist/agentlet-core.min.js`.
3. Creates the core with `registryUrl` set to `@agentlet/demos@<exact>/dist/registry.js`, and a theme picked from `prefers-color-scheme`.
4. Activates the one demo that matches the page, or leaves the launcher open when several match (Wikipedia has two) or none does.

Everything after the first request names an exact version. Mixing a newer loader with an older cached registry or bundle would break in ways that are hard to see, so the `@1` range is used once, for the loader, and never again. The registry works out its bundle URLs from its own address, so the same file works from jsDelivr and from the dev server.

The loader keeps its state in one namespaced global, `__agentletKnownSites`. Clicking the bookmarklet again while the panel loads does nothing, and while it is open only brings it forward. If loading fails, it says so in an alert, with a link to the limits.

## What the package contains

`packages/agentlet-demos/dist/` is built, gitignored, and the only thing published (`files: ["dist"]`).

- `loader.js`: the loader above.
- `registry.js`: agentlet-core's [script-injection registry format](/docs/guides/script-injection/). Each demo is `lazy: true`, so only the launcher loads at start. Each entry also has a `pattern`, a regular expression tested against the page URL, which the core ignores and the loader and launcher read.
- `agentlets/<id>.js`: one IIFE bundle per agentlet, plus the launcher.

## Developing locally

`npm run dev` builds the package and starts a small server on `http://localhost:4400` (`scripts/serve-known-sites.mjs`). Open `/try/known-sites/` on the dev site and the bookmarklet there points at that server, so you can try a build on a real site before publishing. Wikipedia's policy allows localhost.

It is a separate server on purpose. The Astro dev server refuses cross-origin subresource requests, and that protection should stay on for the site. The registry and modules are loaded with `crossOrigin = 'anonymous'`, so the dev server sends `Access-Control-Allow-Origin: *`. Nothing served this way is part of the deployed site, so `public/_headers` has no rule for it.

After editing an agentlet, run `npm run build:known-sites`, reload the host page, and click the bookmarklet again. A recent Chrome can ask whether the site may connect to devices on the local network the first time a public page loads from localhost. Allow it for this test.

## Add a site

1. Add a `KnownSite` to `KNOWN_SITES` in `src/agentlets/known-sites/manifest.ts`: a label, where it runs, and an example link. Check the site's real policy first: if it does not allow scripts from jsDelivr, the bookmarklet cannot load there and a demo would never start.
2. Write `src/agentlets/known-sites/<id>.ts`: a class extending `window.agentlet.Module`, with the site's URL regular expression in `patterns`, ending with the global assignment used by the other files. Use `KNOWN_SITE_STYLES` from `shared.ts` for the panel, and `backToLauncherHtml()` from `src/agentlets/shared.ts` for the way back to the list. Keep it read only, and clean up what it adds to the page in `cleanupModule()`.
3. Add a `KnownSiteAgentlet` to `KNOWN_SITE_AGENTLETS` with the same pattern.

The build, the registry, the launcher and the known-sites page all read the manifest, so nothing else changes. Then add a fixture under `tests/e2e/fixtures/known-sites/` and a test in `tests/e2e/known-sites.spec.ts`.

## Tests

The Playwright tests do not touch any real site. They serve committed fixtures as if they came from `en.wikipedia.org` and `arxiv.org`, send the policy header each site really sent, and answer the jsDelivr URLs from the locally built package and from `node_modules/agentlet-core`. A test also checks that after the loader, every request names an exact version and goes to jsDelivr only. `npm run test:e2e` builds the package first.

## Publishing

Push a tag named `demos-v<version>`, for example `demos-v1.0.1`. The `publish-demos` workflow builds the package, checks that the tag matches the version in `packages/agentlet-demos/package.json`, and runs `npm publish` with the `NPM_TOKEN` secret. It publishes without npm provenance, because the source repository is private and npm only supports provenance for public ones. Bump the version by hand in that file before tagging. Publishing is never automatic on a merge.
