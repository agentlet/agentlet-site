import { KNOWN_SITES_DEV_PORT } from './known-sites-dev.mjs';

/**
 * The bookmarklet for the known-sites demos (src/pages/try/known-sites.astro).
 *
 * Unlike the on-site bookmarklet (src/scripts/bookmarklet.ts), this one is
 * meant for other people's sites, and agentlet.io itself is not allowed by
 * their Content Security Policy (Wikipedia's allows `*.jsdelivr.net` and
 * localhost, not agentlet.io). So it loads its loader from jsDelivr, from the
 * npm package `@agentlet/demos`, using the major range `@1`: a fix released as
 * 1.0.1 reaches everyone without dragging a new bookmark. The loader then
 * pins everything else it loads to its own exact version (see
 * src/scripts/known-sites-loader.ts).
 *
 * The bookmarklet is a classic script tag, not a module script: a module
 * script fetched cross-origin needs CORS, a classic one does not.
 */

/** Production loader URL, the one visitors drag to their bookmarks bar. */
export const KNOWN_SITES_LOADER_URL = 'https://cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js';

/**
 * Where `npm run dev` serves the locally built package (see astro.config.mjs
 * and scripts/serve-known-sites.mjs). Wikipedia's CSP allows `localhost`, so a
 * bookmarklet pointing here can be tried on the real site before a version is
 * published.
 */
export const KNOWN_SITES_DEV_LOADER_URL = `http://localhost:${KNOWN_SITES_DEV_PORT}/loader.js`;

/**
 * jsDelivr serves the `@1` range URL with `max-age=604800`, so a browser that
 * fetched the loader once would keep it for up to a week, even after a purge
 * of the CDN. The bookmarklet therefore adds `?d=YYYYMMDD` (the UTC date when
 * it is clicked): a browser fetches a fresh loader at most once a day, and
 * every visitor shares one URL per day, so the CDN cache stays effective. The
 * loader's own sibling URLs name exact versions and have no query string.
 */
export function buildKnownSitesBookmarkletHref(loaderUrl: string): string {
	const code = `(function(){var s=document.createElement('script');s.src='${loaderUrl}?d='+new Date().toISOString().slice(0,10).replace(/-/g,'');document.head.appendChild(s)})()`;
	return `javascript:${code}`;
}

/**
 * The loader URL a page should put in its bookmarklet: the local dev build
 * when the site itself runs under `npm run dev` on localhost, jsDelivr
 * everywhere else (production, previews, `astro preview`, `wrangler dev`).
 */
export function knownSitesLoaderUrlFor(page: { hostname: string }, isDev: boolean): string {
	const local = page.hostname === 'localhost' || page.hostname === '127.0.0.1' || page.hostname === '[::1]';
	return isDev && local ? KNOWN_SITES_DEV_LOADER_URL : KNOWN_SITES_LOADER_URL;
}
