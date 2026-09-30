// Port of the small dev server that serves the locally built `@agentlet/demos`
// package (scripts/serve-known-sites.mjs). Plain Node ESM, no build step:
// astro.config.mjs and the server script import it outside Astro's own Vite
// pipeline, and src/scripts/known-sites-bookmarklet.ts imports it for the
// bookmarklet's dev URL, so the number is written exactly once.
export const KNOWN_SITES_DEV_PORT = 4400;
