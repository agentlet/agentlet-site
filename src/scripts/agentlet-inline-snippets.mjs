// Single source of truth for the tiny bits every "does the live demo need to
// reopen or load" surface must agree on: the sessionStorage flag's key, and
// where the demo loader lives. Plain Node ESM on purpose (no TypeScript, no
// build step): astro.config.mjs imports this directly, outside of Astro's
// own Vite pipeline, and src/layouts/LandingLayout.astro's frontmatter runs
// in the same kind of plain module context. src/scripts/demo-loader.ts and
// scripts/build-cdn.mjs import it too, so the flag key and the loader's URL
// are each defined exactly once.

/** sessionStorage key recording that the demo is open and which module is active. */
export const FLAG_KEY = 'agentlet:demo';

/** Where scripts/build-cdn.mjs writes the built loader, and where every page loads it from. */
export const LOADER_URL = '/cdn/v1/demo-loader.js';

/**
 * Reopens the live demo only if a previous page left it open (the flag is
 * set), by injecting a `<script>` for the loader. Downloads nothing when the
 * flag is absent, which is the common case: this is the entire reason this
 * script is inlined into every page's HTML instead of being a requested
 * file itself (a separate file would itself be a request on every page,
 * defeating the point).
 *
 * Injected byte-for-byte identically on every landing page
 * (src/layouts/LandingLayout.astro) and every Starlight docs page
 * (astro.config.mjs's `starlight.head` option).
 */
export const AGENTLET_REOPEN_SCRIPT = `(function(){try{if(!sessionStorage.getItem(${JSON.stringify(FLAG_KEY)}))return}catch(e){return}var s=document.createElement('script');s.type='module';s.src=${JSON.stringify(LOADER_URL)};document.head.appendChild(s)})();`;
