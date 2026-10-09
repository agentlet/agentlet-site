---
title: Known-site demos
description: How the agentlet demos for Wikipedia and other well-known sites are built, hosted on jsDelivr, versioned and extended.
---

The [known-sites page](/try/known-sites/) offers one bookmarklet that runs small agentlets on sites this project does not control. This page explains how they are built and hosted, and how to add a site. The code is in `src/agentlets/known-sites/`, the build script is `scripts/build-known-sites.mjs`, and the published package is `packages/agentlet-demos/`.

These demos are separate from the [live demo](/docs/live-demo/) on agentlet.io. That one loads from `/cdn/v1/` on this site and only works on agentlet.io. Nothing about it changed.

## Why jsDelivr

A bookmarklet runs inside someone else's page, so that page's Content Security Policy decides what it may load. Wikipedia's policy allows scripts from `*.jsdelivr.net` and from localhost, and does not allow agentlet.io. So the demos are published as an npm package, `@agentlet/demos`, and served by jsDelivr, which serves any npm package. agentlet-core itself is not copied into that package: the loader takes it from jsDelivr too, from the `agentlet-core` package.

This is also the limit of the approach. A site whose policy does not allow jsDelivr, or does not allow inline scripts at all, cannot run the bookmarklet. On 30 September, 1 October and 4 October 2026:

- Wikipedia allows it.
- Wikidata allows it: its `script-src` lists `*.jsdelivr.net`, and its `default-src` lists `*.wikipedia.org` and the Wikimedia hosts.
- arXiv allows it: it sends only `frame-ancestors 'none'`, with no script-src.
- GitHub, MDN, Stack Overflow and YouTube do not allow inline scripts without a nonce or hash, so even the bookmarklet's own code is refused.
- W3C Technical Reports allow it: they send only `frame-ancestors` and `upgrade-insecure-requests`, with no script-src.
- rfc-editor.org allows it: it sends no policy.
- EUR-Lex allows it: it sends only `frame-ancestors`. Its servers answer a plain `curl` with a bot challenge, so the header was read from a real browser session.
- Hacker News allows inline scripts but limits loaded scripts to itself, Google reCAPTCHA and cdnjs, so the script from jsDelivr is refused. It is an example of a site that restricts scripts to its own domain and a few others. It has no demo here.

Policies change, so check the real page before relying on a site. `tests/e2e/fixtures/known-sites/` keeps the policies Wikipedia, Wikidata, arXiv, W3C and EUR-Lex sent (rfc-editor.org sends none), and the tests apply them.

## What the bookmarklet does

The bookmarklet adds one classic script tag that points at `https://cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js?d=YYYYMMDD`, where the value is the current UTC date, computed when the bookmarklet is clicked. A classic script needs no CORS, and the `@1` range means a fix released as 1.1.1 reaches everyone without dragging a new bookmark.

The date matters because jsDelivr serves the range URL with `cache-control: public, max-age=604800, s-maxage=43200`. Without it, a browser that fetched the loader once could keep it for up to 7 days, even after the CDN was purged. With it, a browser fetches a fresh loader on its first click of each day, and all visitors share the same URL on a given day, so the CDN cache stays effective. Bookmarks added before 2 October 2026 have no date, so people drag the button again once.

The loader then:

1. Bakes in, at build time, the exact version of `@agentlet/demos` and of `agentlet-core` (read from `node_modules/agentlet-core/package.json`).
2. Loads `agentlet-core@<exact>/dist/agentlet-core.min.js`.
3. Creates the core with `registryUrl` set to `@agentlet/demos@<exact>/dist/registry.js`, and a theme picked from `prefers-color-scheme`.
4. Activates the one demo that matches the page, or leaves the launcher open when several match (Wikipedia has three) or none does.

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

## Date timeline

`wikipedia-timeline.ts` finds the dates in an article's text, wraps each in a `<mark>`, and lists them in time order in the panel. Clicking an entry scrolls to the passage and highlights it with `PageHighlighter`. The marks are the only change to the page, and they are removed when the agentlet is closed. It reads the article body only: not tables, the infobox, references, navigation boxes or headings, and nothing after the first end-matter heading (references, notes, external links). It recognises full dates, a month and year, and bare years from 1000 to 2099 that come after a hint word such as "in" or an opening parenthesis, in English, French, German, Spanish and Italian. It marks at most 600 dates.

The panel button "Open timeline view" shows the same dates in agentlet-core's fullscreen dialog (`window.agentlet.utils.Dialog`). The code is in `timeline-view.ts`. Everything in it is derived from the dates the demo already found: there is no AI and no rule for a particular article, and nothing is sent anywhere.

- **Axis.** The scale fits the span of the dates found, with a minimum of one week. Ticks are picked from one list of calendar steps (1, 2, 7 and 14 days; 1, 2, 3 and 6 months; 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500 and 1000 years): the finest step that leaves about 64 pixels per year label, 92 per month label and 112 per day label. A history article gets centuries or decades, an event article gets years, months or days. A single date gets a week of day ticks, and dates in one year get month ticks. Month names follow the page language.
- **Density strip.** Bars count mentions per bucket. Buckets come from the same list of steps, the finest one that leaves at least 14 pixels per bucket, and the axis starts and ends on bucket edges. A mention counts in the bucket that holds the middle of its period. Clicking a bar filters the list below to that bucket, clicking it again or "Show all" clears the filter.
- **Points.** Mentions of the same date collapse into one point with a count. A point is filled for a full date. A month and year or a bare year is hollow, with a line that spans its month or year when the scale is fine enough to show it. Points that would overlap are stacked in up to ten rows.
- **Sections.** A mention belongs to the nearest preceding level-2 heading of the article (a date before the first one belongs to the lead). The nine sections with the most mentions get a colour, in page order; the rest share one grey. Colours are chosen for both colour schemes.
- **Tooltip and navigation.** Hovering or focusing a point shows the sentence around the date. Clicking it, or pressing Enter, closes the dialog and goes to the passage like a panel entry. The points and the bars are each a single tab stop, with the arrow keys, Home and End to move inside. The list below the axis is plain buttons and works without the chart.
- **Export.** "Export to Excel" writes every mention with `window.agentlet.tables.download()`: date (ISO, or year-month, or year), precision, section and sentence, named after the article.

agentlet-core's dialog cancels every Enter key press at the document, which stops a focused button from being activated by Enter. The view activates buttons on keydown before that happens.

## Spec to checklist

One demo, `spec-checklist.ts`, covers three hosts under one manifest entry, "Standards and regulations (W3C, RFC Editor, EUR-Lex)". The readers are in `spec-extract.ts`:

- W3C pages with success criteria (WCAG): one row per success criterion, with its level A, AA or AAA. Other W3C Technical Reports: one row per sentence with a requirement keyword, found through `em.rfc2119` or, when a document does not mark keywords up, by their uppercase spelling. Notes, examples and code blocks are skipped.
- RFC Editor: one row per sentence with an uppercase BCP 14 keyword (RFC 2119 and RFC 8174), read from the paragraphs, list items and cells that have a `section-` or `appendix-` id. The row keeps the section number and the paragraph anchor.
- EUR-Lex: one row per article paragraph that says "shall" or "must". This is a heuristic. The panel says it is a reading aid and not legal advice.

Each row has a status (to review, compliant, partial, not compliant, not applicable) and a note. Both are saved in `localStorage` under a key made from the document URL without its hash, and stay in the browser. If the browser refuses to store them, the panel says so and keeps working. The list shows at most 200 rows at a time, with a counter. An export covers every row that matches the filters.

## Copy a company as a record

`company-record.ts` is the source side of a copy and paste between two web apps, built on `window.agentlet.records` from agentlet-core 2.3.0. It runs on Wikipedia articles and on Wikidata items (`www.wikidata.org/wiki/Q...`), which is why its manifest entry belongs to Wikipedia and has `alsoOn: ['wikidata']`: one pattern, listed under two sites.

- On Wikipedia it reads the company infobox: the name from the caption, the website, the founding year, and the headquarters line. It splits that line on commas and takes the last part as the country, the one before as the city, and anything before that as the street. That is a heuristic and the panel says so. An article whose infobox has no headquarters, founding or industry row gets a message instead of a record.
- On Wikidata it reads the statements the page shows: the label, the website (P856, the preferred one when there are several), the founding date (P571), the street address (P6375), the SIREN (P1616), the headquarters city (P159) and the country (P17).
- It builds an `organization` record with `records.create()`, using the autocomplete vocabulary keys (`organization`, `url`, `street-address`, `postal-code`, `address-level2`, `country-name`), plus `siren` and `founded`, with `labels` for those two. Then it calls `records.copy()` from the click and shows the fields copied and the method the core returned, `clipboard-api` or `copy-event`.

It makes at most two small requests to the Wikidata API, which both sites' policies allow because their `default-src` lists `www.wikidata.org`. On Wikipedia it asks for the SIREN of the linked item. On Wikidata it asks for the country of the headquarters city, because a company item can list several countries, and the one marked preferred is not always the right one. If a request fails, the record is built without that field. `annuaire-entreprises.data.gouv.fr` would be the natural source for a SIREN, but its policy does not allow jsDelivr, so a bookmarklet cannot run there.

The target side is on this site: the `supplier-paste` agentlet of the [live demo](/docs/live-demo/#paste-a-company-as-a-supplier) and the supplier form in the home page sandbox.

## Add a site

1. Add a `KnownSite` to `KNOWN_SITES` in `src/agentlets/known-sites/manifest.ts`: a label, where it runs, an example link, and a `pattern` that tells the launcher which site a page belongs to. Check the site's real policy first: if it does not allow scripts from jsDelivr, the bookmarklet cannot load there and a demo would never start.
2. Write `src/agentlets/known-sites/<id>.ts`: a class extending `window.agentlet.Module`, with the site's URL regular expression in `patterns`, ending with the global assignment used by the other files. Use `KNOWN_SITE_STYLES` from `shared.ts` for the panel, and `backToLauncherHtml()` from `src/agentlets/shared.ts` for the way back to the list. Keep it read only, and clean up what it adds to the page in `cleanupModule()`.
3. Add a `KnownSiteAgentlet` to `KNOWN_SITE_AGENTLETS` with the same pattern. If the pattern covers more than one site, list the others in `alsoOn`.

The build, the registry, the launcher and the known-sites page all read the manifest, so nothing else changes. Then add a fixture under `tests/e2e/fixtures/known-sites/` and a test in `tests/e2e/known-sites.spec.ts`.

## Tests

The Playwright tests do not touch any real site. They serve committed fixtures as if they came from `en.wikipedia.org`, `www.wikidata.org`, `arxiv.org`, `www.w3.org`, `www.rfc-editor.org` and `eur-lex.europa.eu`, send the policy header each site really sent, and answer the jsDelivr URLs from the locally built package and from `node_modules/agentlet-core`. The Wikidata API calls of the company record demo are answered from three recorded responses. A test also checks that after the loader, every request names an exact version and goes to jsDelivr only. `npm run test:e2e` builds the package first.

## Publishing

Push a tag named `demos-v<version>`, for example `demos-v1.2.0`. The `publish-demos` workflow builds the package, checks that the tag matches the version in `packages/agentlet-demos/package.json`, and stages it on npm through trusted publishing (OIDC), with no stored token and with npm provenance, which links each release to the commit and workflow run that built it. A maintainer then approves the staged version with 2FA before it becomes public. Bump the version by hand in that file before tagging. Publishing is never automatic on a merge.

How fast a release reaches people: jsDelivr refreshes the `@1` range within 12 hours, or right away when you call its purge API (see [deploy.md](https://github.com/agentlet/agentlet-site/blob/main/docs/deploy.md) for the release steps). Browsers then pick up the new version on the first click of the next day, thanks to the daily parameter.
