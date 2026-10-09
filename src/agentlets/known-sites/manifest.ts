/**
 * Single source of truth for the agentlets that run on well-known third-party
 * sites (Wikipedia, arXiv, standards), distributed as the `@agentlet/demos` npm
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
	/** More example links, for a site entry that covers several hosts. */
	moreExamples?: { url: string; label: string }[];
	/**
	 * Regular expression source, tested against the full page URL. Tells the
	 * launcher which site a page belongs to, for its "Demos for ..." heading.
	 */
	pattern: string;
}

export interface KnownSiteAgentlet {
	/** Unique id: the registry entry name, the module's own `name`, and the bundle file name. */
	id: string;
	/** Id of the KnownSite this demo belongs to. */
	site: string;
	/** Other KnownSite ids this demo is also listed under, when its pattern covers more than one site. */
	alsoOn?: string[];
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

/** Any language edition's article pages, desktop or mobile host. */
export const WIKIPEDIA_PATTERN = '^https?:\\/\\/[a-z0-9-]+(?:\\.m)?\\.wikipedia\\.org\\/wiki\\/';

/** arXiv listing pages, search results, and abstract pages. */
export const ARXIV_PATTERN = '^https?:\\/\\/(?:www\\.)?arxiv\\.org\\/(?:list|search|abs)\\/';

/** W3C Technical Reports, RFC Editor RFC pages, and EUR-Lex ELI and legal-content pages. */
export const SPEC_PATTERN =
	'^https?:\\/\\/(?:www\\.w3\\.org\\/TR\\/|(?:www\\.)?rfc-editor\\.org\\/rfc\\/rfc\\d+\\.html|eur-lex\\.europa\\.eu\\/(?:eli|legal-content)\\/)';

/** Wikidata item pages (`/wiki/Q42`). */
export const WIKIDATA_PATTERN = '^https?:\\/\\/(?:www\\.)?wikidata\\.org\\/wiki\\/Q\\d+';

/** Wikipedia articles and Wikidata items: where the company record demo runs. */
export const COMPANY_RECORD_PATTERN =
	'^https?:\\/\\/(?:[a-z0-9-]+(?:\\.m)?\\.wikipedia\\.org\\/wiki\\/|(?:www\\.)?wikidata\\.org\\/wiki\\/Q\\d+)';

export const KNOWN_SITES: KnownSite[] = [
	{
		id: 'wikipedia',
		label: 'Wikipedia',
		where: 'Article pages on any language edition (*.wikipedia.org/wiki/...).',
		exampleUrl: 'https://en.wikipedia.org/wiki/Apollo_11',
		exampleLabel: 'Apollo 11 on English Wikipedia',
		moreExamples: [{ url: 'https://en.wikipedia.org/wiki/Danone', label: 'Danone on English Wikipedia' }],
		pattern: WIKIPEDIA_PATTERN,
	},
	{
		id: 'wikidata',
		label: 'Wikidata',
		where: 'Item pages (www.wikidata.org/wiki/Q...). Only the company record demo runs here.',
		exampleUrl: 'https://www.wikidata.org/wiki/Q329426',
		exampleLabel: 'Danone on Wikidata',
		pattern: WIKIDATA_PATTERN,
	},
	{
		id: 'arxiv',
		label: 'arXiv',
		where: 'Listing and search pages (arxiv.org/list/..., arxiv.org/search/...), and abstract pages (arxiv.org/abs/...).',
		exampleUrl: 'https://arxiv.org/list/cs.AI/recent',
		exampleLabel: 'Recent papers in cs.AI on arXiv',
		pattern: ARXIV_PATTERN,
	},
	{
		id: 'standards',
		label: 'Standards and regulations (W3C, RFC Editor, EUR-Lex)',
		where:
			'W3C Technical Reports (www.w3.org/TR/...), RFCs on rfc-editor.org (www.rfc-editor.org/rfc/rfc<number>.html), and EU legal texts on EUR-Lex (eur-lex.europa.eu/eli/... and /legal-content/...).',
		exampleUrl: 'https://www.w3.org/TR/WCAG22/',
		exampleLabel: 'WCAG 2.2 on W3C',
		moreExamples: [
			{ url: 'https://www.rfc-editor.org/rfc/rfc9110.html', label: 'RFC 9110 (HTTP Semantics) on RFC Editor' },
			{ url: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj', label: 'The GDPR on EUR-Lex' },
		],
		pattern: SPEC_PATTERN,
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
	{
		id: 'wikipedia-timeline',
		site: 'wikipedia',
		file: 'wikipedia-timeline',
		className: 'WikipediaTimelineModule',
		title: 'Date timeline',
		description: 'Finds the dates in the article text and builds a chronological timeline, as a list and as a visual view, that scrolls to each passage.',
		pattern: WIKIPEDIA_PATTERN,
	},
	{
		id: 'company-record',
		site: 'wikipedia',
		alsoOn: ['wikidata'],
		file: 'company-record',
		className: 'CompanyRecordModule',
		title: 'Copy a company as a record',
		description:
			'Reads a company article or Wikidata item and copies it as a structured record, ready to paste into a supplier form on a page that runs agentlet.',
		pattern: COMPANY_RECORD_PATTERN,
	},
	{
		id: 'arxiv-papers',
		site: 'arxiv',
		file: 'arxiv-papers',
		className: 'ArxivPapersModule',
		title: 'Papers to spreadsheet',
		description: 'Finds every paper on a listing or search page, previews them, and exports the ones you tick to Excel. On an abstract page, shows a citation line.',
		pattern: ARXIV_PATTERN,
	},
	{
		id: 'spec-checklist',
		site: 'standards',
		file: 'spec-checklist',
		className: 'SpecChecklistModule',
		title: 'Spec to checklist',
		description:
			'Extracts each requirement of a W3C, RFC or EUR-Lex document into an audit checklist with a status and a note per row, and exports it to Excel.',
		pattern: SPEC_PATTERN,
	},
];

/** The site a page URL belongs to, for the launcher's heading. */
export function siteForUrl(url: string): KnownSite | undefined {
	return KNOWN_SITES.find((site) => new RegExp(site.pattern).test(url));
}

/** Demos listed under a site: its own, plus the ones that also run there. */
export function demosForSite(site: KnownSite): KnownSiteAgentlet[] {
	return KNOWN_SITE_AGENTLETS.filter((entry) => entry.site === site.id || entry.alsoOn?.includes(site.id));
}

/** Demos whose pattern matches the given URL, in manifest order. */
export function demosForUrl(url: string): KnownSiteAgentlet[] {
	return KNOWN_SITE_AGENTLETS.filter((entry) => new RegExp(entry.pattern).test(url));
}
