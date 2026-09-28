# Site chip C1 recap: live demo agentlets on agentlet.io

Written on 2026-09-28 by the coordinator of chip C1, for the next chips,
starting with C2 (a mock expense report app with live AI through a proxy in
the Worker). It records the real state, what was delivered, the decisions
taken with the owner, the open points and the lessons learned.

## Real state

- Site `main` = `bdaeabc`, live on https://agentlet.io (Worker with static
  assets, deployed from `main`). CI green. No open pull request.
- agentlet-core `main` = `e4158e9`, **2.1.0 published on npm** (`latest`,
  with provenance) and as a GitHub release. The site depends on
  `agentlet-core@^2.1.0`.
- The visitor journey has three levels: watch (hero animation), try here
  (C1, live), see it on a real business app (C2, to do). The closing bubble
  of every demo points to `/#demo` until C2 exists.

### Pull requests

Site (agentlet/agentlet-site), all merged:

- #12 site-wide "Pause animations" toggle (WCAG 2.2.2), with a still frame
  for the two demo GIFs.
- #13 launcher and build pipeline (core and registry under `/cdn/v1/`,
  hero button, cross-page loader, bookmarklet page, "Live demo" docs page,
  Playwright).
- #14 first wave: receipt to expense report, page audit, documentation
  companion.
- #15 adoption of agentlet-core 2.1.0, workarounds removed, lazy demos.
- #16 owner feedback: demo sandbox collapsed and visually separated,
  bookmarklet chip in the hero, session flag kept in sync.
- #17 second wave: summarize and share a section, compare and export, live
  white label (React), selector workshop, simulated enterprise sign-in;
  quiet panel footer; "Back to all demos".

Core (agentlet/agentlet-core), all merged: #72 module registry (lookup,
explicit activation kept, `loadModule()`, `lazy`), #73 PDF worker
(`pdfWorkerUrl` applied, no CDN fallback, worker in the package), #74 dialog
theming and `icon: ''`, #75 host side effects (silent console by default, no
global Storage patching, lazy cookie polling, complete `cleanup()`), #76
release 2.1.0.

### Remote branches safe to delete

Merged: `feat/pause-animations`, `feat/agentlet-launcher`,
`feat/demo-wave-1`, `feat/core-2-1-adoption`, `feat/demo-sandbox-bookmarklet`,
`feat/demo-wave-2`, plus the phase B ones listed in site-phase-b-recap.md.
On the core: `fix/module-registry-activation`, `fix/pdf-worker-config`,
`fix/dialog-theme`, `fix/host-side-effects`, `release/2.1.0`.

## What was delivered

### Plumbing

- `scripts/build-cdn.mjs` (run by `prebuild` and `predev`) copies
  `agentlet-core.min.js` and `pdf.worker.min.mjs` from the npm package to
  `/cdn/v1/`, bundles each module of `src/agentlets/` with esbuild (IIFE,
  one file per module, `.ts` or `.tsx`), builds `/cdn/v1/demo-loader.js` and
  generates `/cdn/v1/agentlets-registry.js` (synchronous
  `agentletRegistryLoaded` dispatch). Generated files are gitignored.
- `src/agentlets/manifest.ts` is the single source of truth: id, title,
  description, audience, `lazy`, `fileExt`, `requiresSignIn`. Adding a demo
  is one module plus one entry.
- Nothing is downloaded before the visitor clicks. A tiny inline script
  (landing layout and Starlight head) reads the `agentlet:demo`
  sessionStorage flag and only then injects the loader, which reopens the
  panel after each full page load.
- The brand theme (light and dark) lives in `src/scripts/demo-loader.ts`
  and follows the site toggle through `setTheme`. Settings and help buttons
  are hidden; the close button is a quiet icon button.

### Demos (launcher order)

| Demo | Audience | Loading | Main core APIs |
| --- | --- | --- | --- |
| Receipt to expense report | Business | lazy | PDFProcessor, forms.exportForAI, forms.fillFromAI, PageHighlighter |
| Summarize and share a section | Business | lazy | ElementSelector, ScreenCapture, Dialog fullscreen |
| Compare and export | Business | lazy | tables.extract, tables.download, PageHighlighter, storage |
| Live white label | Business | lazy | setTheme, theme:changed, mount API with React, storage |
| Selector workshop | Developers | lazy | ElementSelector, PageHighlighter, forms.quickExport |
| Documentation companion | Developers | eager, `/docs/*` | shortcuts, Dialog command prompt, tables, storage |
| Enterprise sign-in (simulated) | IT and security | lazy | AuthManager popup flow |
| Page audit (locked until sign-in) | IT and security | lazy | Dialog progress and fullscreen, PageHighlighter, tables.download |

Rules every demo follows: AI answers are recorded and labelled "Recorded AI
response"; no demo submits a form; "View the source of this agentlet"; the
closing bubble "This ran on agentlet.io. See it on a real business app",
once per session.

The home page "Demo sandbox" (`<details id="sandbox">`, collapsed by
default, opened by the expense and audit demos) holds a fictitious receipt
(`scripts/generate-demo-receipt.mjs`) and a form with no network action,
plus three deliberate accessibility defects marked `data-demo-defect` that
Lighthouse does not flag and the page audit finds.

The fictitious identity provider lives at `/try/mock-idp/` (noindex, demo
credentials `demo`/`demo` shown on the page, no network: the token is a
local base64 JSON passed in the URL fragment and posted back to the
opener).

### Tests and CI

- Playwright on the built site served by `wrangler dev` with the real
  `_headers` (`playwright.config.ts`, port from `E2E_PORT`, default 8790,
  Chromium only): 63 tests. Every demo test asserts zero console output,
  zero console errors and zero CSP violations. Added to CI after the link
  check.
- Lighthouse on the home page: accessibility, best practices and SEO 100,
  desktop and mobile. Local performance scores are too noisy to compare.

## CSP

`public/_headers` is **unchanged** since phase B. Everything is same-origin
under `/cdn/v1/`; the pdf.js worker is a same-origin module worker covered by
`script-src 'self'`; captures and PDF images are `data:` URLs; downloads use
same-origin `blob:` links, which the CSP does not govern; the identity
provider popup is same origin. The bookmarklet relies on the existing
`'unsafe-inline'`. Production also shows `upgrade-insecure-requests`, added
by Cloudflare.

For C2: a live AI proxy in the Worker keeps `connect-src 'self'` if it is
served on the same origin (for example `/api/ai/`). Scope any widening to
the mock app path.

## Decisions taken with the owner

- Animations still play by default with reduced motion; the header toggle
  and the hero controls are the way to stop them.
- The live demo went to production in one deploy (launcher, wave 1 and core
  2.1.0 together), then #16 and #17 separately.
- Core issues are fixed locally in agentlet-core by this chip rather than
  filed as GitHub issues first. Opus coordinates, Sonnet implements.
- The owner authorised pushes on agentlet-site without asking again; merges
  and npm releases still need an explicit go.
- Drag and drop mode means the bookmarklet: it is a chip in the hero. It
  only works on agentlet.io, since most sites block bookmarklets with their
  CSP; any-site demos need the extension.
- The panel footer keeps only the close button.

## Open points

1. **agentlet-core 2.1.1 candidates**, all worked around in the site:
   - `Dialog.choice()` hard-codes a 📋 icon with no way to omit it.
   - `ElementSelector` gives no callback when the visitor cancels with
     Escape (the selector workshop polls `isActive`).
   - The html2canvas bundled in the core cannot parse `color(srgb ...)`,
     which `color-mix()` resolves to; the section capture neutralises it in
     the clone.
   - Panel action buttons use emoji icons; `AuthManager.createLoginButton()`
     has hard-coded inline colours (dormant on the site).
   - `AuthManager` keeps the signed-in user in memory only; the demo stores
     it in session storage.
   - `AuthManagerConfig.messageHandler` has no typed way to return user
     info.
   - `TablesAPI` cannot build one workbook with several sheets (the docs
     companion builds it with the bundled SheetJS).
   - Scaffold: `plopfile.js` ignores `**/module*.js`, which also drops four
     `tests/module-*.spec.js` files from every generated project.
2. **Repository visibility.** The site repository is private, so "View the
   source of this agentlet" links only work for members. Do not change the
   visibility without the owner.
3. **Bookmarklet** verified in Chromium only (Firefox and Safari not
   available here).
4. **Edge case**: clicking "Try it on this page" while a remembered demo is
   still being restored can leave the session flag out of sync with the
   active module until the next activation.
5. **Lighthouse note** (non scoring): the capability explorer tabs have an
   `aria-label` that differs from their visible text
   (`label-content-name-mismatch`).
6. Phase B open points still open: GIFs as videos, CSP hashes or nonces,
   stale remote branches.

## Notes for C2 (mock expense app with live AI)

- The expense demo already has everything but the live model: PDF to images,
  `forms.exportForAI()`, `forms.fillFromAI()`, highlights, "Check before
  submitting". C2 swaps the recorded response for a call to a proxy in the
  Worker and keeps "Recorded AI response" for the agentlet.io demo.
- `wrangler.jsonc` must stay (static assets Worker). A proxy means adding a
  Worker script next to the assets, with secrets in Cloudflare, and a rate
  limit.
- The closing bubbles link to `/#demo`: point them to the mock app once it
  exists (one place: the shared helper in `src/agentlets/shared.ts`).
- Lazy registry entries are not URL detection candidates until loaded; keep
  an eager entry for any module that must activate by URL.

## Lessons learned

- **Verify in the real browser, not only with tests.** The theme switch bug,
  the registry timeout, the missing spaces around links, the tooltips
  hiding labels and the dark mode contrast of the sign-in button were all
  found by looking, with every test green.
- **A sub-agent's isolation worktree follows the session's primary
  directory**, which switches between the site and the core. Briefs must
  make the agent check `git remote -v` and create its own worktree if
  needed.
- **Tell sub-agents the exact trailer**, and check it anyway: several still
  wrote a model name. `git filter-branch --msg-filter` on the branch range
  fixes it without touching trees.
- **Check the order of cherry-picked commits** after an integration: one
  sub-agent replayed two groups in reverse; replaying them in dependency
  order gave an identical tree.
- **Never pipe a long test run**: a `| tail` hid a hung Playwright run for
  over an hour. Use `--global-timeout` and read a log file.
- **The in-app browser pane is shared and throttled.** Screenshots can be
  blank or torn while hidden or scrolling; measure with JavaScript. Parallel
  sub-agents can land in each other's tabs.
- **Do not bypass CI on merges.** `gh pr merge --admin` is blocked by the
  session guard; wait for CI or ask the owner to merge.
- **`npm pack` of the core before a release**, installed in the site,
  caught consumer issues (type wording, hex-only colour parsing, lazy
  semantics) before publishing.
- **Stash is shared across worktrees**: sub-agents must use a unique tagged
  stash and apply by SHA.
