/**
 * Single source of truth for the agentlets that run on well-known third-party
 * sites (Wikipedia, Hacker News), distributed as the `agentlet-demos` npm
 * package (packages/agentlet-demos/) through jsDelivr. The on-site demos
 * under src/agentlets/manifest.ts are a separate set served from agentlet.io
 * itself; nothing here changes how they work.
 *
 * Adding a site is meant to be three steps:
 *
 * 1. Add a `KnownSite` below (label, where it runs, an example link).
 * 2. Write src/agentlets/known-sites/<id>.ts: a class extending
 *    window.agentlet.Module that ends with
 *    `(window as unknown as Record<string, unknown>).<ClassName> = <ClassName>;`.
 * 3. Add a `KnownSiteAgentlet` below that points at it.
 *
 * scripts/build-known-sites.mjs reads this file to bundle each module with
 * esbuild and to generate registry.js. The launcher
 * (src/agentlets/known-sites/launcher.ts) and the /try/known-sites/ page
 * (src/pages/try/known-sites.astro) import it too, so the list of supported
 * sites is written exactly once.
 */

export interface KnownSite {
	/** Stable id, referenced by KnownSiteAgentlet.site. */
	id: string;
	/** Sentence-case name shown in lists. */
	label: string;
	/** Plain-language description of where the demos run, for lists. */
	where: string;
	/** A real page where the demos apply, offered as an example link. */
	exampleUrl: string;
	/** Short label for the example link. */
	exampleLabel: string;
	/**
	 * `works`: the bookmarklet can load the demos on this site. `blocked`: the
	 * site's Content-Security-Policy does not allow scripts from jsDelivr, so
	 * the bookmarklet cannot start the demos there today. A blocked site's
	 * demos are still built and tested against a copy of its markup, so they
	 * work the day the policy allows it. Shown honestly on
	 * /try/known-sites/ and in the docs.
	 */
	status: 'works' | 'blocked';
	/** For a blocked site: what was checked, and when. */
	statusNote?: string;
}

export interface KnownSiteAgentlet {
	/** Unique id: the registry entry name, the module's own `name`, and the bundle file name. */
	id: string;
	/** Id of the KnownSite this demo belongs to. */
	site: string;
	/** Source file under src/agentlets/known-sites/, without its extension. */
	file: string;
	/** Global class name the built bundle attaches to the page (window[className]). */
	className: string;
	/** Sentence-case title, also returned by the module's own getPanelTitle(). */
	title: string;
	/** One sentence describing what the demo does. */
	description: string;
	/**
	 * Regular expression source, tested with `new RegExp(pattern).test(href)`
	 * against the full page URL. Decides where the demo is offered and
	 * activated. The same string is written into registry.js and read by the
	 * launcher; the module passes it to its own `patterns` too.
	 */
	pattern: string;
}

export const KNOWN_SITES: KnownSite[] = [
	{
		id: 'wikipedia',
		label: 'Wikipedia',
		where: 'Article pages on any language edition (*.wikipedia.org/wiki/...).',
		exampleUrl: 'https://en.wikipedia.org/wiki/Apollo_11',
		exampleLabel: 'Apollo 11 on English Wikipedia',
		status: 'works',
	},
	{
		id: 'hacker-news',
		label: 'Hacker News',
		where: 'Story and comment pages (news.ycombinator.com/item?id=...).',
		exampleUrl: 'https://news.ycombinator.com/item?id=1',
		exampleLabel: 'A story page on Hacker News',
		status: 'blocked',
		statusNote:
			"On 30 September 2026 Hacker News sent a Content-Security-Policy whose script-src allows only its own pages, inline scripts, Google reCAPTCHA and cdnjs. A bookmarklet cannot load a script from jsDelivr under it, so this demo cannot start there today.",
	},
];

/**
 * The one agentlet the registry loads eagerly. Its pattern matches every
 * page: it lists a supported site's demos, or the supported sites when the
 * page is not one of them.
 */
export const KNOWN_SITES_LAUNCHER = {
	id: 'known-sites-launcher',
	file: 'launcher',
	className: 'KnownSitesLauncherModule',
	title: 'Agentlet demos',
	description: 'Lists the demos available on this site, or the supported sites.',
};

/** Any language edition's article pages, desktop or mobile host. */
export const WIKIPEDIA_PATTERN = '^https?:\\/\\/[a-z0-9-]+(?:\\.m)?\\.wikipedia\\.org\\/wiki\\/';

/** A Hacker News item page (story with its comments). */
export const HACKER_NEWS_ITEM_PATTERN = '^https?:\\/\\/news\\.ycombinator\\.com\\/item\\?(?:[^#]*&)?id=\\d+';

export const KNOWN_SITE_AGENTLETS: KnownSiteAgentlet[] = [
	{
		id: 'wikipedia-tables',
		site: 'wikipedia',
		file: 'wikipedia-tables',
		className: 'WikipediaTablesModule',
		title: 'Tables to spreadsheet',
		description: 'Finds the infobox and every table of the article, previews them, and exports them to Excel.',
		pattern: WIKIPEDIA_PATTERN,
	},
];

export function findKnownSite(id: string): KnownSite | undefined {
	return KNOWN_SITES.find((site) => site.id === id);
}

/** Demos whose pattern matches the given URL, in manifest order. */
export function demosForUrl(url: string): KnownSiteAgentlet[] {
	return KNOWN_SITE_AGENTLETS.filter((entry) => new RegExp(entry.pattern).test(url));
}
