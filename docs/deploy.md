# Deploying agentlet.io

This site is a static Astro and Starlight build. The build output is
`dist/`, produced by `npm run build`, using the Node version pinned in
`.node-version` (22). This document describes how to deploy it to
Cloudflare Pages.

All the steps below are dashboard steps, performed by a human with access
to the Cloudflare account and the agentlet GitHub organisation. This
document does not grant that access and no automation in this repository
performs them.

## Recommended: Cloudflare Pages Git integration

This is the recommended path. Cloudflare builds and deploys the site
directly from GitHub, with no secrets stored in the repository.

1. In the Cloudflare dashboard, go to Workers & Pages, then Create.
2. Choose Pages, then Connect to Git.
3. Authorise the Cloudflare GitHub app for the agentlet organisation.
   Grant it access to the `agentlet-site` repository only. The repository
   is private, so this authorisation step is required before Cloudflare
   can read it.
4. Select the `agentlet-site` repository and set the production branch to
   `main`.
5. Set the framework preset to Astro. If the preset list does not offer
   Astro, choose None and set the build settings manually.
6. Set the build command to `npm run build`.
7. Set the build output directory to `dist`.
8. Leave the root directory empty (the project lives at the repository
   root).
9. Cloudflare Pages reads the Node version from `.node-version`
   automatically. If a build ever picks up a different Node version,
   check the Node version in the build log; if it is not 22, set the
   `NODE_VERSION` environment variable to `22` in the project's build
   settings as a fallback.
10. Save and deploy.

With this setup, every push to `main` deploys to production. Every pull
request and every other branch gets its own preview deployment, served
from a unique `*.pages.dev` URL, so changes can be reviewed before they
reach `main`. No GitHub secret is needed for any of this: the GitHub app
only grants Cloudflare read access to the repository content.

## Alternative: GitHub Actions with wrangler

An alternative path builds and deploys from a GitHub Actions workflow,
using `cloudflare/wrangler-action`. This repository does not include such
a workflow. The snippet below is a reference, not something to add to
`.github/workflows/`.

This path needs two repository secrets:

- `CLOUDFLARE_API_TOKEN`, scoped to Account, Cloudflare Pages, Edit.
- `CLOUDFLARE_ACCOUNT_ID`.

Sample workflow step, run after `npm ci` and `npm run build`:

```yaml
- name: Deploy to Cloudflare Pages
  uses: cloudflare/wrangler-action@v3
  with:
    apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    command: pages deploy dist --project-name=agentlet-site
```

The Git integration (path a) is recommended over this path for this
project. It needs no secrets, so there is nothing to rotate or leak. It
also builds on Cloudflare's own infrastructure with native preview URLs
per branch and per pull request, matching what this project needs without
extra workflow code to maintain. The GitHub Actions path is worth
revisiting only if the build ever needs a step that Cloudflare's own build
image cannot run.

## Custom domains

Once the Pages project has a first successful deployment:

1. Open the project, go to Custom domains, and add `agentlet.io`.
2. Add `www.agentlet.io` as a second custom domain.
3. The `agentlet.io` DNS zone is already on Cloudflare, so Pages creates
   the required DNS records itself. No manual DNS entry is needed.
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

`public/_headers` defines the response headers for every route, using the
[Cloudflare Pages `_headers` file format](https://developers.cloudflare.com/pages/configuration/headers/).
Astro copies files under `public/` into `dist/` unchanged, so this file
ends up at `dist/_headers` and Cloudflare Pages picks it up automatically.

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
- `Permissions-Policy: camera=(), microphone=(), geolocation=(),
  interest-cohort=()`. Turns off browser features this site does not use,
  and opts out of the FLoC cohort tracking trial.
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
left at Cloudflare Pages' default caching rather than marked immutable,
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
the `*.pages.dev` preview URL:

- `/` loads and renders the home page.
- `/docs/` loads and renders the documentation index.
- `/docs/getting-started/` loads.
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

Cloudflare Pages keeps every previous deployment. To roll back:

1. Open the Pages project in the Cloudflare dashboard.
2. Go to the Deployments tab.
3. Find the last known good deployment in the list.
4. Open its menu and choose Rollback to this deployment (or Retry
   deployment, depending on the dashboard wording at the time).

This re-promotes that build to production immediately, without needing a
new commit or a new build.
