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
 */

/** Static fallback for when JavaScript does not run: the production origin. */
export const BOOKMARKLET_FALLBACK_ORIGIN = 'https://agentlet.io';

export function buildBookmarkletHref(origin: string): string {
	const code = `(function(){var s=document.createElement('script');s.type='module';s.src='${origin}${LOADER_URL}';s.onload=function(){window.__openAgentletDemo&&window.__openAgentletDemo()};document.head.appendChild(s)})()`;
	return `javascript:${code}`;
}
