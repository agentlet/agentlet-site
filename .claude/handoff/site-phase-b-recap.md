# Site phase B recap: agentlet.io skeleton, landing, docs, deployment

Written on 2026-09-25 by the coordinator of phase B (chip B), for the next
phases, starting with chip C (playable demo). It records the real state of
the repository, what was delivered, the decisions taken with the user, the
open points, and the lessons learned.

## Real state

- Repository: `agentlet/agentlet-site` on GitHub, **private** (the user
  chose private at creation). Default branch `main`.
- Pull requests:
  - #1 `build: scaffold astro and starlight site`, merged.
  - #2 `feat: add landing page`, merged.
  - #3 `ci: prepare cloudflare pages deployment`, merged.
  - #4 `docs: migrate the agentlet-core documentation to starlight`, merged.
  - #5 `docs: add phase b handoff recap` (this file), merged.
  - A follow-up adds `wrangler.jsonc`, `public/_redirects` and an internal
    link check, after the first Cloudflare build failed (see below).
- CI: `.github/workflows/build.yml` runs `npm ci`, lint, check, build, the
  typography check and the internal link check on `dist/`, on every push
  and pull request. All runs
  since the Node 22 fix are green. The three failed runs of 2026-09-24 at
  21:36 UTC predate that fix and are expected.
- Deployment: **not live yet.** The user created the Cloudflare project as
  a Worker built from Git (the dashboard default), not as a Pages project.
  Its first build failed: with no wrangler config in the repository,
  `npx wrangler deploy` auto-configured the site as a server-rendered
  Astro app and that build broke. `wrangler.jsonc` now declares a static
  assets Worker serving `dist/`. The remaining dashboard steps are the
  user's: redeploy, attach `agentlet.io` and `www.agentlet.io`, add the www
  to apex redirect rule, set SSL/TLS to Full (strict). Nothing is served
  on agentlet.io until then. See `docs/deploy.md`.
- Domain: agentlet.io was transferred to Cloudflare on 2026-09-24.
  Registrar and DNS are both Cloudflare (nameservers
  `rafe.ns.cloudflare.com`, `dakota.ns.cloudflare.com`). The apex can point
  to the Worker directly; the old Route53 constraint no longer applies.
- Branch protection: not configured. GitHub refuses it on this private
  repository with the organisation's current plan (HTTP 403, "Upgrade to
  GitHub Pro or make this repository public"). Merges go through pull
  requests by convention only.
- Merged remote branches still present: `build/astro-skeleton`,
  `feat/landing`, `ci/cloudflare-pages`, `feat/docs-migration`,
  `docs/phase-b-handoff`. Safe to delete.

## What was delivered

### Stack and tooling

- Astro 7 and Starlight 0.42, static output in `dist/`,
  `site: 'https://agentlet.io'`. Docs under `/docs/`, custom home page at
  `/`.
- Node 22.12 or later (Astro 7 refuses Node 20). The major version is
  pinned in `.node-version`, read by CI and by the Cloudflare build.
- TypeScript 6.0, because typescript-eslint does not support TypeScript 7
  yet.
- ESLint (typescript-eslint, eslint-plugin-astro), husky with a
  commitlint `commit-msg` hook mirroring agentlet-core's commit types.
- `scripts/check-typography.mjs`: fails on em dashes, en dashes and middle
  dots. It runs in `npm run lint` on `src`, `public` and the Astro config,
  and in CI on `dist/` (Pagefind's vendored bundle is skipped).
- Native CSS with brand tokens in `src/styles/landing.css`, Starlight
  theming in `src/styles/starlight-theme.css`. IBM Plex Sans and Mono are
  self-hosted through `@fontsource`, with no Google Fonts request.
- `CLAUDE.md` describes the structure, commands, content rules and the
  design decisions below.

### Brand

- Source: the Claude Design project "Agentlet logo explorations", brand
  kit "piste 5F", exported as a zip (the Claude Design connector could not
  be authorised in the session).
- Deviations from the kit, asked by the user: the symbol is orange with a
  navy face on every background, including light ones. The light lockup
  keeps a navy wordmark. The kit's favicon had lost its style block in the
  export and was fixed. The Claude Design project itself was not updated
  with these changes.
- Assets live in `public/brand/` and `src/assets/brand/`, with favicons and
  PNG icons at the root of `public/`, and the social image
  `public/brand/agentlet-social-1280x640.png`.

### Landing page (`/`)

- Hero with the tagline "Augment your web apps, without touching the
  backend." (the kit's line, also on the social image), CTAs, and a
  "Live demo, coming soon" badge in `src/components/landing/Hero.astro`,
  reserved for chip C.
- Hero story animation (`src/components/scenes/HeroStoryScene.astro`):
  eight steps, about 27.5 seconds, looping, with subtitles, a segmented
  progress bar, and Pause and Replay buttons. It shows an expense page
  alone, a click on the agentlet extension icon, the panel opening, a
  receipt read into the form (Submit highlighted, never clicked), an Excel
  export, an AI answer, and a closing step on the agentlet layer on top of
  the unchanged app.
- Definition of the word agentlet, the two demo GIFs, three deployment
  modes with their own scenes, a capability explorer (eight capabilities,
  ARIA tabs, one scene each, real API names only), guiding principles, a
  comparison with robots, get started commands, footer.
- Scene system: `src/components/scenes/`, `src/styles/scenes.css`,
  `src/scripts/scenes.ts`. Pure HTML and CSS, sized in container units, no
  layout shift. Scenes play only when visible and pause when the tab is
  hidden.
- Lighthouse on the built site: 100 in accessibility, best practices and
  SEO on desktop and mobile. Performance is 100 on desktop and 94 on
  mobile, because of the two GIFs.

### Documentation (`/docs/`, pull request #4)

- 25 pages plus the index. Getting started, Concepts, Guides, Reference
  (public API) and Contributing, all in the sidebar.
- Sources: the twelve files of agentlet-core `docs/`, README sections, and
  CLAUDE.md, at agentlet-core `e3f78fa`. Every page ends with a
  `Source:` line.
- `starlight-links-validator` fails the build on broken internal links and
  anchors.
- The guides follow `src/types/public-api.d.ts` where the old core docs
  describe APIs that do not exist. See the open points.

### Deployment preparation (`docs/deploy.md`, `public/_headers`)

- Recommended path: a Worker with static assets built from Git
  (`wrangler.jsonc`), with no secrets and preview URLs for other branches.
  Pages works too with the same files. A GitHub Actions and wrangler
  alternative is documented, not installed.
- `public/_headers`: nosniff, Referrer-Policy, X-Frame-Options,
  Permissions-Policy (camera, microphone, geolocation), HSTS without
  preload, a CSP matched to the build, and an immutable cache on
  `/_astro/*`. It was tested locally with the headers applied: no CSP
  violation, and the Pagefind search works.
- `public/cdn/README.md` reserves `/cdn/v1/` for the built agentlet-core
  and the registry of the live demo.

## Decisions taken with the user

- Hosting on Cloudflare, as a Worker serving static assets. The repository
  is private.
- DNS and registrar on Cloudflare, so the apex is served by the Worker
  directly.
- Content rules: English, sentence case, no emoji in titles, no puffery,
  short sentences, **no em dash, en dash or middle dot** anywhere (they
  "read as AI-written").
- "Robot" instead of "RPA", with RPA spelled out once as robotic process
  automation.
- **Animations play even when the reduced-motion preference is set.** This
  is a product decision by the user, whose own Mac has Reduce motion on.
  The hero always exposes Pause and Replay.
- The hero is one story animation, not a feature carousel. The feature
  scenes live in the capability explorer instead.
- Commit trailer: `Co-Authored-By: Claude <noreply@anthropic.com>`, with no
  model name.

## Open points

1. **Cloudflare setup, by the user.** Follow `docs/deploy.md`. After the
   first deploy, run its verification checklist on the `*.workers.dev` URL,
   then again on agentlet.io.
2. **Pull request #4 (docs)** to merge.
3. **agentlet-core docs.** Out of scope for phase B, to do in agentlet-core:
   replace its `docs/` with links to agentlet.io/docs. Also fix or drop the
   stale APIs they describe, which do not exist in the code:
   - form filling: `validateValues`, `waitForElement`, the `onSuccess`,
     `onError` and `onSkipped` callbacks;
   - environment variables: `delete`, `validate`, `export`,
     `getStatistics` (the real method is `remove`);
   - authentication examples calling the internal `handleSuccess` and
     `handleError`;
   - z-index: `LEGACY_Z_INDEX`, `layerPreview`, and the richer
     `detect`, `suggest` and `analyze` options;
   - script injection: the `validateSecurity` option;
   - form extraction, AI-ready forms and select options: certainty-scored
     selectors, ARIA metadata, `defaultSelected`.
4. **`/cdn/v1/`** is reserved and empty. Chip C decides what goes there:
   the built core, the registry, the demo agentlet.
5. **Looping scenes without a pause control.** The explorer and deployment
   scenes loop with no way to stop them. WCAG 2.2.2 asks for one on moving
   content longer than five seconds. The options are a site-wide "Pause
   animations" toggle or a loop limit. The user has not decided.
6. **Demo GIFs** (about 6 MB) could become muted looping videos, for mobile
   performance.
7. **CSP hardening.** `script-src` needs `'unsafe-inline'` today for the
   inline scripts of Astro and Starlight. Hashes or nonces are a later
   option.
8. **Stale remote branches** to delete, listed above.

## Notes for chip C (playable demo)

- The expense report demo app lives in `agentlet/agentlet-demo-apps` (mock
  apps, Nexus Corp). The site only reserves space for it: the hero badge
  and `/cdn/v1/`.
- The CSP on the site is strict: `connect-src 'self'` and
  `script-src 'self'`. A demo served on agentlet.io that calls an AI proxy
  on another origin, or loads scripts from elsewhere, needs `public/_headers`
  updated, ideally scoped to the demo path only.
- Scenes can be reused for any demo teaser: see `SceneFrame.astro` and the
  anchored cursor pattern (the cursor is a child of the element it clicks).
- The agentlet-core npm package is not published yet. The docs say so on
  the Install page. Update that page and the Get started block on the
  landing when it is.

## Lessons learned

- **Astro 7 needs Node 22.12 or later.** The initial brief said Node 20.
  Local builds passed on Node 24 while CI failed.
- **The coordinator must not write in a sub-agent's worktree.** A hook
  blocks it. Route changes through the agent that owns the worktree, or work
  on a branch that is not checked out elsewhere.
- **A fresh non-isolated sub-agent is sandboxed to the coordinator's
  worktree.** Use `isolation: worktree`, or resume the agent that owns the
  target worktree.
- **`gh repo create --source=.` fails inside a git worktree.** Create the
  repository, then add the remote by hand. `git merge-tree --write-tree` is
  not available on this machine's git either.
- **The user's Mac has Reduce motion on.** Test animations with that in mind.
  To see motion before the product decision, the coordinator served a copy
  of `dist/` with the reduced-motion media queries neutralised, instead of
  editing the source.
- **The in-app browser pane throttles hidden pages.** Timers slow down and
  screenshots can come back blank. Force the step or measure computed
  styles instead of trusting one screenshot.
- **Shared scene animations leak.** A shared class with an infinite
  animation keeps running inside a scene that expects step-driven states.
  Neutralise it explicitly.
- **Buttons do not inherit the page font.** Set `font: inherit`.
- **Starlight components do not work in `.md`.** Use `:::note` asides, or
  rename the page to `.mdx`.
- **Keep `wrangler.jsonc`.** Without it, `npx wrangler deploy` in a Cloudflare
  build turns the static site into a server-rendered Astro app and fails.
- **The docs links validator only covers the docs.** Moving
  `/docs/getting-started/` broke the landing's Get started links.
  `scripts/check-links.mjs` now checks every built page, and
  `public/_redirects` keeps old URLs working.
- **Old agentlet-core docs are not a reliable API source.** Check against
  `src/types/public-api.d.ts` and the implementation.
