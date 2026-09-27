/**
 * Single source of truth for every agentlet this site builds and serves
 * under /cdn/v1/.
 *
 * Adding a demo agentlet is meant to be exactly two steps:
 *
 * 1. Write src/agentlets/<id>.ts: a class extending window.agentlet.Module
 *    (see launcher.ts for the shape, or the mount API guide under
 *    /docs/guides/mount-api/), ending with
 *    `(window as unknown as Record<string, unknown>).<ClassName> = <ClassName>;`
 *    so the bundle attaches its class to the global scope the way the
 *    registry loader expects (see /docs/guides/script-injection/).
 * 2. Add one entry below.
 *
 * scripts/build-cdn.mjs reads this file to bundle each module with esbuild,
 * to generate /cdn/v1/agentlets-registry.js, and to build the "View the
 * source of this agentlet" link. The launcher module (src/agentlets/
 * launcher.ts) also imports this file directly, bundled into its own
 * output, to render its list without depending on any network request
 * beyond the modules it already loaded through the registry.
 */

export type AgentletAudience = 'business' | 'developers' | 'it-and-security';

export const AUDIENCE_LABELS: Record<AgentletAudience, string> = {
	business: 'Business',
	developers: 'Developers',
	'it-and-security': 'IT and security',
};

export interface AgentletManifestEntry {
	/** Unique id: the registry entry name and the module's own `name`. */
	id: string;
	/** Source file under src/agentlets/, without the .ts extension. */
	file: string;
	/** Global class name the built bundle attaches to the page (window[className]). */
	className: string;
	/**
	 * Human, sentence-case title. Shown in the launcher list for demo
	 * entries, and returned by the module's own `getPanelTitle()` (the panel
	 * header otherwise falls back to `name`, which is the lowercase,
	 * hyphenated id, e.g. "launcher" rather than "Live demo").
	 */
	title: string;
	/**
	 * One sentence describing what the agentlet does. Shown in the launcher
	 * list for demo entries; used as the module's own `description` either way.
	 */
	description: string;
	/** Who the demo is for. Set for demo entries, left out for site infrastructure (the launcher itself). */
	audience?: AgentletAudience;
	/**
	 * False for site infrastructure modules (the launcher itself, which the
	 * registry loads like any other agentlet but which never appears in its
	 * own list). True for demo agentlets, which the launcher lists.
	 */
	isDemo: boolean;
}

export const AGENTLET_MANIFEST: AgentletManifestEntry[] = [
	{
		id: 'launcher',
		file: 'launcher',
		className: 'AgentletLauncherModule',
		title: 'Live demo',
		description: 'Lists the demo agentlets available to try on this site.',
		isDemo: false,
	},

	{
		id: 'expense-receipt',
		file: 'expense-receipt',
		className: 'ExpenseReceiptModule',
		title: 'Receipt to expense report',
		description: 'Reads a sample receipt and fills an expense report form for you to review.',
		audience: 'business',
		isDemo: true,
	},

	{
		id: 'page-audit',
		file: 'page-audit',
		className: 'PageAuditModule',
		title: 'Page audit',
		description: 'Runs a deterministic accessibility and structure audit of the current page.',
		audience: 'it-and-security',
		isDemo: true,
	},

	{
		id: 'docs-companion',
		file: 'docs-companion',
		className: 'AgentletDocsCompanionModule',
		title: 'Documentation companion',
		description: 'Exports tables, copies code examples, and tracks your reading progress on the docs.',
		audience: 'developers',
		isDemo: true,
	},

	// More demo agentlets are added here, one manifest entry per module.
	// Nothing else in the build pipeline or the launcher needs to change
	// for a new entry to appear and work.
];

/** Demo entries only, in manifest order: what the launcher lists. */
export function listDemoAgentlets(): AgentletManifestEntry[] {
	return AGENTLET_MANIFEST.filter((entry) => entry.isDemo);
}
