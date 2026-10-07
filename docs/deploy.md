# Deploying agentlet.io

This site is a static Astro and Starlight build. The build output is
`dist/`, produced by `npm run build`, using the Node version pinned in
`.node-version` (22). This document describes how to deploy it on
Cloudflare, as a Worker that serves static assets only.

All the steps below are dashboard steps, performed by a human with access
to the Cloudflare account and the agentlet GitHub organisation. This
document does not grant that access and no automation in this repository
performs them.

## Recommended: a Worker with static assets, built from Git

This is the path the project uses. Cloudflare builds the site from GitHub
and deploys `dist/` as the static assets of a Worker, with no Worker
script and no secrets stored in the repository.

`wrangler.jsonc` at the repository root holds the configuration: the Worker
name (`agentlet-site`), the assets directory (`./dist`), the 404 page
handling, and trailing slash handling for HTML pages. Keep this file: when
it is missing, `wrangler deploy` tries to auto-configure the project as a
server-rendered Astro app (it adds the Cloudflare adapter), and the build
fails.

1. In the Cloudflare dashboard, go to Workers & Pages, then Create, then
   import a repository from Git.
2. Authorise the Cloudflare GitHub app for the agentlet organisation.
   Grant it access to the `agentlet-site` repository only. Cloudflare
   needs this authorisation to build the repository and to report checks
   on its pull requests.
3. Select the `agentlet-site` repository. The project name must be
   `agentlet-site`, the same as `name` in `wrangler.jsonc`.
4. Set the production branch to `main`.
5. Set the build command to `npm run build`.
6. Set the deploy command to `npx wrangler deploy`.
7. Keep the non-production branch deploy command at Cloudflare's default,
   `npx wrangler preview` (Worker Previews, open beta), so other branches
   get a preview URL without replacing production. It requires the
   `previews` block in `wrangler.jsonc`, which is present and empty on
   purpose. `npx wrangler versions upload` also works if Previews are ever
   turned off.
8. Leave the root directory empty (the project lives at the repository
   root).
9. The build reads the Node version from `.node-version`. If a build log
   shows another version, set the `NODE_VERSION` environment variable to
   `22` in the build settings.
10. Save and deploy.

With this setup, every push to `main` deploys to production on
`agentlet-site.<account>.workers.dev`. Other branches, including pull
request branches, get their own preview deployment and URL. Cloudflare
reports each of these builds as a check on the pull request. No GitHub secret is needed: the GitHub app only
grants Cloudflare read access to the repository content.

## Alternative: Cloudflare Pages

Cloudflare Pages also serves this site with no change: create a Pages
project (Workers & Pages, Create, Pages, Connect to Git) with the build
command `npm run build` and the output directory `dist`. Pages reads the
same `_headers` and `_redirects` files and ignores `wrangler.jsonc`. The
Worker path above is preferred because it is the one Cloudflare's
dashboard creates by default today.

## Alternative: GitHub Actions with wrangler

Another path builds and deploys from a GitHub Actions workflow, using
`cloudflare/wrangler-action`. This repository does not include such a
workflow. The snippet below is a reference, not something to add to
`.github/workflows/`.

This path needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`, scoped to Account, Workers Scripts, Edit.
- `CLOUDFLARE_ACCOUNT_ID`.

Sample workflow step, run after `npm ci` and `npm run build`:

```yaml
- name: Deploy to Cloudflare
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: deploy
```

The Git integration is recommended over this path. It needs no secrets, so
there is nothing to rotate or leak, and it builds on Cloudflare's own
infrastructure with preview URLs for other branches. The GitHub Actions
path is worth revisiting only if the build ever needs a step that
Cloudflare's build image cannot run.

## Custom domains

Once the Worker has a first successful deployment:

1. Open the Worker, go to Settings, then Domains & Routes, and add
   `agentlet.io` as a custom domain.
2. Add `www.agentlet.io` as a second custom domain.
3. The `agentlet.io` DNS zone is already on Cloudflare, so Cloudflare
   creates the required DNS records itself. No manual DNS entry is needed.
4. The domain can take a few minutes to become active after it is added.

### Redirect www to the apex

Add a Cloudflare Redirect Rule so `www.agentlet.io` forwards to
`agentlet.io`:

1. In the zone, go to Rules, then Redirect rules.
2. Create a rule matching `www.agentlet.io/*`.
3. Set the target URL to `https://agentlet.io/${1}`, preserving the query
   string.
4. Set the status code to 301.

### TLS settings

1. In the zone, set the SSL/TLS mode to Full (strict).
2. Enable Always use HTTPS.

## Security headers

`public/_headers` defines the response headers for every route, using
Cloudflare's `_headers` file format, supported by Workers static assets and
by Pages alike. Astro copies files under `public/` into `dist/` unchanged,
so this file ends up at `dist/_headers`, and Cloudflare applies it without
serving the file itself. This was checked locally with `npx wrangler dev`.

Headers applied to `/*`:

- `X-Content-Type-Options: nosniff`. Stops the browser from guessing a
  different content type than the one the server sent, which prevents
  some content-sniffing attacks.
- `Referrer-Policy: strict-origin-when-cross-origin`. Sends the full page
  URL as a referrer on same-origin requests, and only the origin on
  cross-origin requests, so other sites do not learn the full path a
  visitor came from.
- `X-Frame-Options: DENY`. Stops any site from embedding this site in an
  iframe. Kept alongside `frame-ancestors 'none'` in the CSP for browsers
  that do not read the CSP directive.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Turns
  off camera, microphone, and geolocation, which the site does not use.
- `Strict-Transport-Security: max-age=31536000`. Tells returning browsers
  to only use HTTPS for this origin for a year. `preload` and
  `includeSubDomains` are left out for now. They can be added later, once
  the domain has been serving HTTPS reliably for a while: `preload` in
  particular is hard to reverse, since it gets baked into browsers.
- `Content-Security-Policy`, detailed below.

### Content Security Policy

The policy is:

```
default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

Each directive, and why it is set this way:

- `default-src 'self'`. Fallback for any resource type not covered by a
  more specific directive: same origin only.
- `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'`. Astro and
  Starlight inline a few small scripts directly in the page, such as the
  theme script that sets light or dark mode before the page paints, and
  Starlight's table of contents and search scripts. `'unsafe-inline'` is
  needed for those today. Starlight's search, powered by Pagefind, loads
  a WebAssembly module, which needs `'wasm-unsafe-eval'`. Moving the
  inline scripts to hashed or nonced sources, to drop `'unsafe-inline'`,
  is possible hardening for later, but it depends on Starlight's own
  output staying stable enough to hash reliably.
- `style-src 'self' 'unsafe-inline'`. The build inlines small `<style>`
  blocks and `style` attributes, for example the theme colour variables
  and per-component sizing. `'unsafe-inline'` covers those.
- `img-src 'self' data:`. Images are self-hosted. `data:` is needed
  because some bundled CSS embeds small SVG icons as `data:image/svg+xml`
  URIs.
- `font-src 'self'`. All fonts (IBM Plex Sans and IBM Plex Mono) are
  bundled through `@fontsource` and served from `/_astro/`, not loaded
  from a font CDN.
- `connect-src 'self'`. Pagefind's search index and WebAssembly module
  are fetched at runtime from `/pagefind/` on the same origin. No
  third-party endpoint is called from the browser.
- `object-src 'none'`. No `<object>`, `<embed>`, or `<applet>` is used.
- `base-uri 'self'`. Stops an injected `<base>` tag from changing where
  relative URLs resolve.
- `form-action 'self'`. The site has no third-party form submission.
- `frame-ancestors 'none'`. Same protection as `X-Frame-Options: DENY`,
  expressed in the CSP.
- `upgrade-insecure-requests`. Belt and braces alongside Always use HTTPS
  and HSTS: any accidental `http:` reference is upgraded to `https:`.

The build output was checked directly for what the CSP needs to allow:
every inline `<script>` and `<style>` in `dist/*.html`, every `style`
attribute, every `data:` URI in the built CSS, every font file, and every
external `http:` or `https:` reference in the built HTML, CSS, and
JavaScript. The only external references found are anchor links (to
GitHub) and third-party attribution comments inside Pagefind's bundled
client code, not requests the browser makes on page load. Nothing in the
build needs a directive wider than the list above.

### Caching

`public/_headers` also sets a long cache lifetime for hashed build
assets:

```
/_astro/*
  Cache-Control: public, max-age=31536000, immutable
```

Every file under `/_astro/` has a content hash in its filename (for
example `index.DGJexmFg.css`), so a new build always produces a new
filename when the content changes. It is safe to cache these forever.

Pagefind's assets under `/pagefind/` are not all hashed the same way.
Some files, such as the search fragments and index, have a content hash
in their name. Others, such as `pagefind.js`, `pagefind-ui.js`, the
worker script, and the WebAssembly files, keep a stable filename across
builds. Because the two are mixed under the same path, `/pagefind/*` is
left at Cloudflare's default caching rather than marked immutable,
to avoid serving a stale `pagefind.js` after a Starlight or Pagefind
version upgrade.

### Verifying headers after deploy

After the first deploy, check the headers from the command line:

```bash
curl -sI https://agentlet.io/
```

Confirm the response includes `x-content-type-options`,
`referrer-policy`, `x-frame-options`, `permissions-policy`,
`strict-transport-security`, and `content-security-policy` with the
values above. Also check an `/_astro/` asset URL to confirm its
`cache-control` header.

## Verification checklist

After the first deploy, before pointing the custom domain at it, check
the `*.workers.dev` URL:

- `/` loads and renders the home page.
- `/docs/` loads and renders the documentation index.
- `/docs/getting-started/install/` loads, and the old
  `/docs/getting-started/` redirects to it (see `public/_redirects`).
- A non-existent path serves the 404 page, styled the same as the rest of
  the site.
- The favicon appears in the browser tab.
- Fonts render as IBM Plex Sans and IBM Plex Mono, not a fallback font.
- The headers listed above are present on the response (see the `curl`
  command in the previous section).
- No Content-Security-Policy violation appears in the browser console on
  `/` or on a docs page.
- On a docs page, the search box (Pagefind) opens and returns results
  with no console error, confirming its WebAssembly module and index load
  under the CSP.
- The light and dark theme toggle works.

Repeat the same checks once the custom domain is attached and serving
traffic.

## Rollback

Cloudflare keeps the previous versions of the Worker. To roll back:

1. Open the Worker in the Cloudflare dashboard.
2. Go to Deployments.
3. Find the last known good version in the list.
4. Choose Rollback (the wording can change with the dashboard).

This puts that version back in production immediately, without needing a
new commit or a new build.

## Redirects

`public/_redirects` holds permanent redirects for URLs that moved, in the
same format for Workers static assets and Pages. It currently sends the
old `/docs/getting-started/` page to `/docs/getting-started/install/`.
Add a line there whenever a published URL changes.

## Publishing the @agentlet/demos package

The known-sites demos are not part of the Cloudflare deployment. They are an
npm package, `@agentlet/demos` (`packages/agentlet-demos/`), served to other
sites by jsDelivr. See `/docs/guides/known-sites/` for why. The Cloudflare build
is unchanged and does not build or publish it.

One-time setup, done by a human with access to the npm account and the GitHub
repository:

1. On npmjs.com, open the `@agentlet/demos` package, Settings, Trusted
   Publisher, GitHub Actions, and enter: organization `agentlet`, repository
   `agentlet-site`, workflow filename `publish-demos.yml`, no environment.
   Leave "Allow npm publish" and "Allow npm dist-tag" unchecked, so the
   workflow can only stage a version. No token or GitHub secret is needed.
2. npm marks the trusted publisher as pending until its first use, within a
   deadline shown on npmjs.com: publish a release before it.

To release:

1. Change `version` in `packages/agentlet-demos/package.json` and merge it.
2. Push a tag named `demos-v<version>` (for example `demos-v1.0.1`) on that
   commit.
3. Approve the staged version with 2FA: on npmjs.com (package
   `@agentlet/demos`, Staged Packages tab), or with `npm login` then
   `npm stage approve <stage-id>`. The stage id is in the workflow's job
   summary. Only then is the version public.

The `publish-demos` workflow (`.github/workflows/publish-demos.yml`) builds the
package, fails if the tag does not match the version in `package.json`, and
stages it on npm through trusted publishing (OIDC), with npm provenance, which
links each release to the commit and workflow run that built it. The workflow
holds no npm token, and nothing becomes public without a maintainer's 2FA
approval. The bookmarklet uses the `@1` range, so a 1.x
release reaches existing bookmarks. A breaking change needs a new major
version, a new bookmarklet URL, and a new bookmarklet on the site.

How a release reaches people:

- jsDelivr refreshes the `@1` range within 12 hours. To do it right away,
  purge it once the version shows on the npm registry:
  `https://purge.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js`
- jsDelivr serves that URL with `cache-control: public, max-age=604800,
  s-maxage=43200`, so a purge alone does not refresh browsers that already
  have the loader. The bookmarklet adds `?d=YYYYMMDD` (the UTC date when it is
  clicked) to the loader URL. A browser then fetches a fresh loader on its
  first click of each day.
- Bookmarks added before the daily parameter existed (2 October 2026) keep
  the plain URL. People drag the button again once.

Warning: do not request the new exact-version URLs
(`@agentlet/demos@<version>/...`) before the npm registry shows that version.
jsDelivr caches the 404, and the URL then needs a purge too. Check
`npm view @agentlet/demos version` first.
