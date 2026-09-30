import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page, Route } from '@playwright/test';
import { buildKnownSitesBookmarkletHref, KNOWN_SITES_LOADER_URL } from '../../src/scripts/known-sites-bookmarklet';

/**
 * Helpers for tests/e2e/known-sites.spec.ts.
 *
 * The known-sites demos run on other people's sites, so the tests serve
 * committed fixtures as if they came from those sites (`page.route`, no real
 * network), with the real Content-Security-Policy header Wikipedia sends, and
 * answer the jsDelivr URLs from the locally built files:
 *
 *   https://cdn.jsdelivr.net/npm/agentlet-demos@1/dist/loader.js   the bookmarklet's range URL
 *   https://cdn.jsdelivr.net/npm/agentlet-demos@<x.y.z>/dist/...   everything the loader then loads
 *   https://cdn.jsdelivr.net/npm/agentlet-core@<x.y.z>/dist/...    the core
 *
 * Every request is recorded, so a test can check that nothing went to a host
 * the page's policy would not allow, and that the loader pinned exact versions.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DEMOS_DIST = join(ROOT, 'packages/agentlet-demos/dist');
const CORE_DIST = join(ROOT, 'node_modules/agentlet-core/dist');
const FIXTURES = join(HERE, 'fixtures/known-sites');

export const DEMOS_VERSION: string = JSON.parse(readFileSync(join(ROOT, 'packages/agentlet-demos/package.json'), 'utf8')).version;
export const CORE_VERSION: string = JSON.parse(readFileSync(join(ROOT, 'node_modules/agentlet-core/package.json'), 'utf8')).version;

export const WIKIPEDIA_URL = 'https://en.wikipedia.org/wiki/Apollo_11';
export const HN_URL = 'https://news.ycombinator.com/item?id=9000001';
export const OTHER_SITE_URL = 'https://example.com/';

const WIKIPEDIA_CSP = readFileSync(join(FIXTURES, 'wikipedia-csp.txt'), 'utf8').trim();
const WIKIPEDIA_HTML = readFileSync(join(FIXTURES, 'wikipedia-article.html'), 'utf8');
const HN_CSP = readFileSync(join(FIXTURES, 'hacker-news-csp.txt'), 'utf8').trim();
const HN_HTML = readFileSync(join(FIXTURES, 'hacker-news-item.html'), 'utf8');

/** The Hacker News fixture, with or without the comments posted "after the first visit". */
export function hackerNewsHtml(withLaterComments: boolean): string {
	return withLaterComments ? HN_HTML : HN_HTML.replace(/<!--LATER-START-->[\s\S]*<!--LATER-END-->/, '');
}

export interface KnownSitesRun {
	/** Every request the page made, as `host + path`, in order. */
	requests: string[];
	/** `securitypolicyviolation` events and console errors seen on the page. */
	cspViolations: () => Promise<string[]>;
}

interface Options {
	/** Page to serve at `url`. */
	html: string;
	/** Content-Security-Policy header to send with it, if any. */
	csp?: string;
	url: string;
}

function contentType(path: string): string {
	return path.endsWith('.mjs') || path.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'application/octet-stream';
}

function serveFile(route: Route, file: string): Promise<void> {
	try {
		return route.fulfill({
			status: 200,
			body: readFileSync(file),
			headers: { 'content-type': contentType(file), 'access-control-allow-origin': '*' },
		});
	} catch {
		return route.fulfill({ status: 404, body: 'not found' });
	}
}

/** Serves `options.html` at `options.url` and answers the jsDelivr URLs from local builds. Call before `page.goto()`. */
export async function serveKnownSitesPage(page: Page, options: Options): Promise<KnownSitesRun> {
	const requests: string[] = [];

	await page.addInitScript(() => {
		const w = window as unknown as { __cspViolations: string[] };
		w.__cspViolations = [];
		document.addEventListener('securitypolicyviolation', (event) => {
			w.__cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`);
		});
	});

	await page.route('**/*', async (route) => {
		const url = new URL(route.request().url());
		requests.push(`${url.host}${url.pathname}${url.search}`);

		if (url.href === options.url) {
			const headers: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };
			if (options.csp) headers['content-security-policy'] = options.csp;
			return route.fulfill({ status: 200, body: options.html, headers });
		}

		if (url.host === 'cdn.jsdelivr.net') {
			const demos = /^\/npm\/agentlet-demos@([^/]+)\/dist\/(.+)$/.exec(url.pathname);
			if (demos) {
				const [, version, file] = demos;
				// The range the bookmarklet uses resolves to the current build;
				// an exact version must be the one this build has.
				const known = version === '1' || version === DEMOS_VERSION;
				return known ? serveFile(route, join(DEMOS_DIST, file)) : route.fulfill({ status: 404, body: 'unknown version' });
			}
			const core = /^\/npm\/agentlet-core@([^/]+)\/dist\/(.+)$/.exec(url.pathname);
			if (core) {
				return core[1] === CORE_VERSION
					? serveFile(route, join(CORE_DIST, core[2]))
					: route.fulfill({ status: 404, body: 'unknown version' });
			}
		}

		// Anything else (favicon, fixture images) is answered empty, never fetched.
		return route.fulfill({ status: 204, body: '' });
	});

	return {
		requests,
		cspViolations: () => page.evaluate(() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? []),
	};
}

export async function serveWikipedia(page: Page): Promise<KnownSitesRun> {
	return serveKnownSitesPage(page, { html: WIKIPEDIA_HTML, csp: WIKIPEDIA_CSP, url: WIKIPEDIA_URL });
}

/**
 * The Hacker News fixture without the site's Content-Security-Policy, so the
 * demo itself can be tested. The real site sends a policy that blocks the
 * bookmarklet's script (see serveHackerNewsWithItsPolicy()).
 */
export async function serveHackerNews(page: Page, withLaterComments = false): Promise<KnownSitesRun> {
	return serveKnownSitesPage(page, { html: hackerNewsHtml(withLaterComments), url: HN_URL });
}

/** The Hacker News fixture with the policy news.ycombinator.com sent on 2026-09-30. */
export async function serveHackerNewsWithItsPolicy(page: Page): Promise<KnownSitesRun> {
	return serveKnownSitesPage(page, { html: hackerNewsHtml(false), csp: HN_CSP, url: HN_URL });
}

/**
 * Clicks the real bookmarklet on the current page. A trusted click on a
 * `javascript:` link is governed by the page's CSP the way a visitor's click
 * on a bookmark is (`page.evaluate()` would bypass it), so this is what makes
 * the Wikipedia tests a check of CSP compatibility.
 */
export async function clickBookmarklet(page: Page, loaderUrl: string = KNOWN_SITES_LOADER_URL): Promise<void> {
	await page.evaluate((href) => {
		document.getElementById('test-bookmarklet')?.remove();
		const link = document.createElement('a');
		link.id = 'test-bookmarklet';
		link.href = href;
		link.textContent = 'bookmarklet';
		link.style.cssText = 'position:fixed;top:0;left:0;z-index:2147483646;background:#fff';
		document.body.appendChild(link);
	}, buildKnownSitesBookmarkletHref(loaderUrl));
	await page.locator('#test-bookmarklet').click();
}
