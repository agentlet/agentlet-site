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
version is in `.node-version`, used by CI and by Cloudflare Pages.

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

## Where the docs live

Documentation content is in `src/content/docs/docs/`, served under
`/docs/`. See `CLAUDE.md` for the full project structure and content style
rules.

## Deploy

The site deploys to Cloudflare Pages. See [`docs/deploy.md`](docs/deploy.md)
for the full setup, including custom domains and security headers.
