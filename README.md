# agentlet-site

Source of [agentlet.io](https://agentlet.io): the presentation site and
documentation for the [agentlet](https://github.com/agentlet/agentlet-core)
framework.

agentlet is an open source (MIT) JavaScript framework that augments existing
web applications without touching their backend, through small agents
injected by bookmarklet, browser extension, or native integration. This site
is built with [Astro](https://astro.build) and
[Starlight](https://starlight.astro.build): a custom home page at `/`, and
documentation under `/docs/`.

## Develop

Requires Node.js 22.12 or later (Astro 7 requirement). The pinned major
version is in `.node-version`, used by CI and by the Cloudflare build.

```bash
npm ci
npm run dev
```

## Build

```bash
npm run build
```

The static site is generated into `dist/`. Other useful commands:

```bash
npm run preview   # preview the production build locally
npm run check     # astro check (TypeScript and Astro diagnostics)
npm run lint      # ESLint
```

## Dependency security scan

The `Security` workflow (`.github/workflows/security.yml`) scans dependencies
for known vulnerabilities on every pull request, every push to `main` and
every night. It uses the shared actions in `agentlet/.github`, pinned by
commit SHA.

What is scanned:

- **Blocking scope: what reaches browsers.** The build scripts write esbuild
  metafiles for the `/cdn/v1/` scripts and for the `@agentlet/demos` package,
  and `astro.config.mjs` records the client modules of the Astro build when
  `SBOM_META_DIR` is set. They all go to `reports/security/meta/`, which is
  gitignored and never part of `dist/`, `public/` or the npm package. One
  SBOM is built from them.
- **Reporting scope: `package-lock.json`.** Build tooling and dev
  dependencies. Shown in the results, never blocking.

The gate fails when a finding in the blocking scope is critical or high and
has a fix, or is in the CISA known exploited vulnerabilities catalog. The
nightly run opens or updates one issue labelled `security` when it fails.
`publish-demos.yml` runs the same gate on the package SBOM before
`npm publish`, then attaches that SBOM to the GitHub release of the tag.

Run it locally (needs osv-scanner, and a checkout of `agentlet/.github`):

```bash
SBOM_META_DIR=reports/security/meta npm run build
npm run build:known-sites
node <.github>/actions/dependency-scan/bin/sbom-from-esbuild-metafile.mjs \
  --root=. --out=reports/security/sbom-bundle.cdx.json reports/security/meta/*/*.meta.json
node <.github>/actions/dependency-scan/bin/scan.mjs \
  --blocking-sbom=reports/security/sbom-bundle.cdx.json
```

### Reading the results

Findings are uploaded to code scanning: open the Security tab, then Code
scanning, and filter by the `dependency-vulnerabilities` category. The job
summary of each run shows the gate result and the findings, and the full
reports (SARIF, JSON, merged SBOM) are in the `dependency-scan-reports`
artifact of the run.

### Exceptions

A finding that cannot be fixed yet can be accepted in
`security/vulnerability-exceptions.json`. Every entry needs:

- `id`: the GHSA or CVE identifier.
- `package`: the affected package name (optional, recommended).
- `reason`: why the risk is accepted, for example no upstream fix and the
  code path is not reachable.
- `owner`: the GitHub handle of the person who follows up.
- `expires`: a `YYYY-MM-DD` date, set to a realistic review date. Once it
  passes, the entry stops matching and the gate fails until it is renewed or
  removed.

Exceptions are changed through a pull request and reviewed like code. Remove
an entry as soon as the fix is available.

## Where the docs live

Documentation content is in `src/content/docs/docs/`, served under
`/docs/`. See `CLAUDE.md` for the full project structure and content style
rules.

## Deploy

The site deploys to Cloudflare, as a Worker serving static assets
(`wrangler.jsonc`). See [`docs/deploy.md`](docs/deploy.md)
for the full setup, including custom domains and security headers.
