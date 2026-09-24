# agentlet-site

Source of agentlet.io: the marketing home page and the documentation for the
agentlet framework (agentlet-core).

## Structure

- `src/pages/index.astro`: the custom home page (not a Starlight page).
- `src/components/landing/`: components used only by the home page.
- `src/styles/`: global and landing styles.
- `src/content/docs/docs/`: Starlight documentation content, served under
  `/docs/`. `src/content/docs/docs/index.md` is `/docs/`,
  `src/content/docs/docs/getting-started.md` is `/docs/getting-started/`.
- `src/content.config.ts`: Starlight's `docs` content collection.
- `public/`: static files copied as-is (favicons, manifest, images, GIFs,
  architecture diagrams).
- `astro.config.mjs`: Astro and Starlight configuration, including
  `site: 'https://agentlet.io'`.

## Commands

- `npm run dev`: start the local dev server.
- `npm run build`: static build to `dist/`.
- `npm run preview`: preview the production build.
- `npm run check`: `astro check` (TypeScript and Astro diagnostics).
- `npm run lint`: ESLint over the whole project.

Before committing, `npm run lint`, `npm run check` and `npm run build` must
all exit 0.

## Content style rules

These apply everywhere: page copy, UI strings, and code comments visible in
the UI.

- English.
- Sentence case in all titles, buttons and navigation labels (for example
  "Get started", not "Get Started").
- No emojis in titles.
- No em dashes (`—`) anywhere, and no en dashes used as punctuation. Use a
  comma, a period, or "and" instead.
- No marketing puffery: avoid words like "revolutionary", "seamless",
  "supercharge", "unleash".
- Short sentences.
- Keep claims factual and traceable to the agentlet-core README.

## Design spirit

Simple, open source, honest. Plain typography, generous whitespace, content
first, code blocks, one accent colour. No gradients, no stock illustrations,
no testimonials, no pricing, no hype.

## Source of truth

`agentlet-core` (the framework itself) lives in a sibling repository and is
read-only from here: never edit it. Its README.md is the reference for all
factual claims made on this site. Its `resources/` and `docs/img/` folders
are the source for logos, favicons, and diagrams used in `public/`.

## Commit rules

- Conventional Commits, lowercase subject, no trailing period, header under
  72 characters.
- The `commit-msg` husky hook runs commitlint
  (`@commitlint/config-conventional` plus a project-specific `type-enum`).
- Never use `--no-verify`. If a hook fails, fix the underlying issue.
