import { LOADER_URL } from './agentlet-inline-snippets.mjs';

/**
 * Single source of truth for the agentlet demo bookmarklet's code, used by
 * both the hero's bookmarklet chip (src/components/landing/Hero.astro) and
 * /try/bookmarklet/ (src/pages/try/bookmarklet.astro). Both build their
 * `javascript:` href from the visitor's own page origin at runtime (so it
 * also works from a local dev server or a preview deployment), falling back
 * to the production origin for the server-rendered markup a visitor sees
 * before that runtime rewrite runs (or with JavaScript disabled).
 *
 * Running the bookmarklet loads the demo loader from the given origin, the
 * same file the hero's "Try it on this page" button loads, and opens the
 * demo once it is ready, via the same window.__openAgentletDemo hook
 * (src/scripts/demo-loader.ts).
 *
 * The demo only works on its own origin: /cdn/v1/ sends no CORS headers, so
 * a module script from it fails on any other site, and the demo drives this
 * site's own sandbox. Run elsewhere, the bookmarklet says so and offers the
 * known-sites demos, which do run on other sites. A load failure on the
 * right origin shows an alert instead of failing silently.
 */

/** Static fallback for when JavaScript does not run: the production origin. */
export const BOOKMARKLET_FALLBACK_ORIGIN = 'https://agentlet.io';

/** Shown when the bookmarklet runs on another site. */
export const OFF_SITE_MESSAGE =
	'This agentlet demo only runs on agentlet.io. Open the demos that run on other sites, like Wikipedia?';

/** Shown when the demo loader fails to load. */
export const LOAD_ERROR_MESSAGE = 'The agentlet demo could not load. Try again from agentlet.io.';

export function buildBookmarkletHref(origin: string): string {
	const code = `(function(){var o='${origin}';if(location.origin!==o){if(confirm('${OFF_SITE_MESSAGE}'))location.href=o+'/try/known-sites/';return}var s=document.createElement('script');s.type='module';s.src=o+'${LOADER_URL}';s.onload=function(){window.__openAgentletDemo&&window.__openAgentletDemo()};s.onerror=function(){alert('${LOAD_ERROR_MESSAGE}')};document.head.appendChild(s)})()`;
	return `javascript:${code}`;
}
