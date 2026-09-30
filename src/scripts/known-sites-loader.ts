import type { AgentletAPI, AgentletCoreConfig, AgentletTheme } from 'agentlet-core';
import { DARK_THEME, LIGHT_THEME } from './agentlet-theme';
import { demosForUrl } from '../agentlets/known-sites/manifest';

/**
 * Loader of the known-sites bookmarklet. Built by scripts/build-known-sites.mjs
 * into packages/agentlet-demos/dist/loader.js, a classic (non-module) script,
 * because a bookmarklet injects it with a plain `<script src>` on someone
 * else's page.
 *
 * It runs on a third-party site, so it is careful about two things:
 *
 * 1. Where things load from. Served by jsDelivr, it bakes in the exact version
 *    of this package and of agentlet-core (both replaced at build time) and
 *    loads its registry and bundles from those exact versions, never from the
 *    `@1` range the bookmarklet points at. Mixing a newer loader with an older
 *    cached bundle would break in confusing ways. Served from anywhere else
 *    (the local dev server), it loads siblings from its own directory and the
 *    core from the same origin's /cdn/v1/, so a build can be tried on a real
 *    site before it is published.
 * 2. Not colliding with the page. Everything lives in one namespaced global,
 *    and a second click while the panel is loading or open does nothing harmful.
 *
 * It does not use agentlet.io's theme attribute: the panel follows
 * `prefers-color-scheme`.
 */

declare const __DEMOS_VERSION__: string;
declare const __CORE_VERSION__: string;

const NAMESPACE = '__agentletKnownSites';
const JSDELIVR_ORIGIN = 'https://cdn.jsdelivr.net';
const PAGE_URL = 'https://agentlet.io/try/known-sites/';

interface LoaderState {
	status: 'idle' | 'loading' | 'ready';
}

type AgentletWindow = Window & {
	AgentletCore?: { default: new (config?: AgentletCoreConfig) => AgentletAPI };
	agentlet?: AgentletAPI;
	[NAMESPACE]?: LoaderState;
};

const host = window as AgentletWindow;
const ownScript = document.currentScript as HTMLScriptElement | null;
const ownSrc = ownScript?.src ?? '';

function isJsDelivr(url: string): boolean {
	try {
		return new URL(url).origin === JSDELIVR_ORIGIN;
	} catch {
		return false;
	}
}

/** Where this loader's siblings and the core come from. See the file comment. */
function resolveLocations(): { registryUrl: string; coreUrl: string; pdfWorkerUrl: string } {
	if (!ownSrc || isJsDelivr(ownSrc)) {
		const demos = `${JSDELIVR_ORIGIN}/npm/@agentlet/demos@${__DEMOS_VERSION__}/dist/`;
		const core = `${JSDELIVR_ORIGIN}/npm/agentlet-core@${__CORE_VERSION__}/dist/`;
		return {
			registryUrl: `${demos}registry.js`,
			coreUrl: `${core}agentlet-core.min.js`,
			pdfWorkerUrl: `${core}pdf.worker.min.mjs`,
		};
	}
	const directory = ownSrc.replace(/[?#].*$/, '').replace(/[^/]*$/, '');
	return {
		registryUrl: `${directory}registry.js`,
		coreUrl: new URL('/cdn/v1/agentlet-core.min.js', ownSrc).href,
		pdfWorkerUrl: new URL('/cdn/v1/pdf.worker.min.mjs', ownSrc).href,
	};
}

function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement('script');
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Failed to load ${src}`));
		document.head.appendChild(script);
	});
}

function themeFor(dark: boolean): Partial<AgentletTheme> {
	return dark ? DARK_THEME : LIGHT_THEME;
}

function explainFailure(error: unknown): void {
	console.error('Agentlet demos could not start on this page.', error);
	window.alert(
		'Agentlet demos could not start on this page. The site probably blocks scripts added by a bookmarklet. ' +
			`See ${PAGE_URL} for the sites that work.`,
	);
}

async function start(state: LoaderState): Promise<void> {
	const { registryUrl, coreUrl, pdfWorkerUrl } = resolveLocations();

	if (!host.AgentletCore) await loadScript(coreUrl);
	const Core = host.AgentletCore?.default;
	if (!Core) throw new Error('agentlet-core did not expose window.AgentletCore.default');

	const query = window.matchMedia('(prefers-color-scheme: dark)');
	const core = new Core({
		registryUrl,
		pdfWorkerUrl,
		theme: themeFor(query.matches),
		// The core's own settings and help screens have nothing to configure
		// or explain for these demos.
		showSettingsButton: false,
		showHelpButton: false,
	});

	const onSchemeChange = (): void => {
		core.setTheme(themeFor(query.matches));
	};
	query.addEventListener('change', onSchemeChange);
	core.eventBus.on('core:cleanup', () => {
		query.removeEventListener('change', onSchemeChange);
		state.status = 'idle';
	});

	await core.init();

	// A single demo for this page opens directly. Several (Wikipedia has two)
	// are listed by the launcher, which is already active: its pattern matches
	// every page.
	const demos = demosForUrl(window.location.href);
	if (demos.length === 1) {
		const registry = core.moduleRegistry;
		const entry = registry.getRegistryEntries().find((candidate) => candidate.name === demos[0].id);
		if (entry) {
			const instance = await registry.loadModule(entry);
			await registry.activateModule(instance);
		}
	}

	core.show();
	state.status = 'ready';
}

function run(): void {
	const state = (host[NAMESPACE] ??= { status: 'idle' });

	if (state.status === 'loading') return;
	if (state.status === 'ready' && host.agentlet) {
		host.agentlet.show();
		return;
	}

	state.status = 'loading';
	start(state).catch((error: unknown) => {
		state.status = 'idle';
		explainFailure(error);
	});
}

run();
