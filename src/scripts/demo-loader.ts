import type { AgentletAPI, AgentletCoreConfig, AgentletTheme } from 'agentlet-core';
import { FLAG_KEY } from './agentlet-inline-snippets.mjs';

/**
 * Loads and opens the live demo. Built by scripts/build-cdn.mjs into
 * /cdn/v1/demo-loader.js (see src/scripts/agentlet-inline-snippets.mjs for
 * the exact URL, the single source of truth every caller reads from).
 *
 * Nothing on the page loads this file directly: it is only ever injected,
 * by one of
 *
 * 1. The tiny inline reopen script (AGENTLET_REOPEN_SCRIPT in
 *    agentlet-inline-snippets.mjs), present on every page, which injects
 *    this file only if a previous page left the sessionStorage flag set.
 * 2. The hero button's click handler (src/components/landing/Hero.astro).
 * 3. The bookmarklet (src/pages/try/bookmarklet.astro).
 *
 * Two jobs, both here to avoid a second copy of the loading logic:
 *
 * 1. `openAgentletDemo()`, attached to `window.__openAgentletDemo`, for (2)
 *    and (3) above to call once this file has finished loading.
 * 2. A reopen check that runs as soon as this module loads: if the flag is
 *    set, load the demo and restore whichever module was active. This
 *    covers the case where (1) injected this file itself; when (2) or (3)
 *    injected it instead, the flag is normally absent and this is a no-op.
 */

const CORE_URL = '/cdn/v1/agentlet-core.min.js';
const REGISTRY_URL = '/cdn/v1/agentlets-registry.js';
const PDF_WORKER_URL = '/cdn/v1/pdf.worker.min.mjs';
const DEFAULT_MODULE = 'launcher';

declare global {
	interface Window {
		/** The IIFE global agentlet-core.min.js sets; the constructor is its `default` export. */
		AgentletCore?: { default: new (config?: AgentletCoreConfig) => AgentletAPI };
		__openAgentletDemo?: () => void;
	}
}

/**
 * Brand theme, light and dark. Mirrors the tokens in src/styles/landing.css
 * and src/styles/starlight-theme.css by value (both are hand-authored from
 * the same brand kit): read live from those files' custom properties
 * instead of duplicating the values here, custom properties would not
 * exist at all on a Starlight page, which only defines the `--sl-color-*`
 * set, so the values are copied here and must be kept in sync by hand if
 * the brand kit changes.
 */
const FONT_FAMILY =
	"'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const LIGHT_THEME: Partial<AgentletTheme> = {
	primaryColor: '#f4a261',
	secondaryColor: '#0f3350',
	backgroundColor: '#ffffff',
	contentBackground: '#f4f6f8',
	textColor: '#3d4f5e',
	borderColor: '#d9e0e6',
	headerBackground: '#0f3350',
	headerTextColor: '#ffffff',
	// No dialogHeaderBackground/dialogHeaderTextColor here: agentlet-core's
	// ThemeManager.processThemeConfig() now inherits both from
	// headerBackground/headerTextColor whenever the dialog-specific keys are
	// left unset, so every dialog's header already reads the same as the
	// panel's own header without repeating the two colours above.
	actionButtonBackground: '#f4a261',
	actionButtonBorder: '#f4a261',
	actionButtonHover: '#f7b47c',
	actionButtonText: '#0f3350',
	borderRadius: '8px',
	fontFamily: FONT_FAMILY,
};

const DARK_THEME: Partial<AgentletTheme> = {
	primaryColor: '#f4a261',
	secondaryColor: '#e6edf2',
	backgroundColor: '#0b1a26',
	contentBackground: '#16293a',
	textColor: '#e6edf2',
	borderColor: '#24394d',
	headerBackground: '#f4a261',
	headerTextColor: '#0f3350',
	// See the comment on LIGHT_THEME's own headerBackground/headerTextColor
	// above: the dialog-specific colours are inherited from these, no need
	// to repeat them here either.
	actionButtonBackground: '#f4a261',
	actionButtonBorder: '#f4a261',
	actionButtonHover: '#f7b47c',
	actionButtonText: '#0f3350',
	borderRadius: '8px',
	fontFamily: FONT_FAMILY,
};

function currentSiteTheme(): 'light' | 'dark' {
	return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function themeFor(mode: 'light' | 'dark'): Partial<AgentletTheme> {
	return mode === 'light' ? LIGHT_THEME : DARK_THEME;
}

function readActive(): string | null {
	try {
		return sessionStorage.getItem(FLAG_KEY);
	} catch {
		return null;
	}
}

function writeActive(name: string): void {
	try {
		sessionStorage.setItem(FLAG_KEY, name);
	} catch {
		// sessionStorage may be unavailable (private browsing, blocked storage);
		// the demo still works for this page load, it just will not survive a
		// full-page navigation to the next one.
	}
}

function clearActive(): void {
	try {
		sessionStorage.removeItem(FLAG_KEY);
	} catch {
		// see writeActive
	}
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

let corePromise: Promise<AgentletAPI> | null = null;
let themeObserver: MutationObserver | null = null;
let lastAppliedTheme: 'light' | 'dark' | null = null;

/**
 * Applies the current site theme to the panel, but only when it actually
 * changed since the last call. Called both by the MutationObserver below
 * and once right after init() resolves (see startCore()), which is what
 * closes the race described there: idempotency means calling it an extra
 * time here is free.
 */
function syncTheme(core: AgentletAPI): void {
	const mode = currentSiteTheme();
	if (mode === lastAppliedTheme) return;
	lastAppliedTheme = mode;
	core.setTheme(themeFor(mode));
}

/**
 * Real close hook: the panel's close button calls the core's own
 * `cleanup()`, which tears the whole agentlet down and emits `core:cleanup`
 * on the event bus just before deleting `window.agentlet`
 * (agentlet-core src/index.ts). That is the signal this flag waits for,
 * rather than e.g. minimizing the panel, which leaves it running.
 *
 * Also keeps the flag in sync with whichever module is actually active, by
 * listening for `module:activated`, not only for the explicit
 * `openAgentletDemo()` call below. Must be attached before `core.init()` is
 * called, not merely before it resolves: `core.eventBus` already exists
 * once the instance is constructed (agentlet-core's AgentletCore
 * constructor creates it before `init()` is ever called), but `init()`
 * itself calls `moduleRegistry.initialize()`, which registers every eager
 * module and, for each one, runs the very first URL-based detection
 * (`ModuleRegistry.checkUrlChange()`, see the `trigger: 'moduleRegistration'`
 * case in agentlet-core's source). That can activate a module and emit
 * `module:activated` synchronously, before `init()`'s own promise settles.
 * A previous version of this file attached this listener from inside
 * `core.init().then(...)`, so it missed exactly that first, URL-based
 * activation: on a docs page, for example, `init()` would activate the
 * docs companion through its own pattern match, emit `module:activated` for
 * it with no listener yet attached to hear it, and leave the flag holding
 * whatever a previous page had last written (e.g. "expense-receipt"),
 * rather than "docs-companion", the module that was actually now active.
 */
function wireLifecycle(core: AgentletAPI): void {
	core.eventBus.on('core:cleanup', () => {
		clearActive();
		themeObserver?.disconnect();
		themeObserver = null;
		lastAppliedTheme = null;
		corePromise = null;
	});

	core.eventBus.on('module:activated', (data) => {
		// Payload shape is `{ module: string, context }`, set by ModuleRegistry
		// (agentlet-core src/core/ModuleRegistry.ts); EventBusAPI types it as
		// `unknown` since events are plain strings with caller-defined payloads.
		const name = (data as { module?: unknown } | undefined)?.module;
		if (typeof name === 'string') writeActive(name);
	});
}

/**
 * Attached only after init() resolves, so a site theme toggle that happens
 * during the (network-bound) loading window fires no mutation this observer
 * is around to see. syncTheme() is called again, unconditionally, right
 * after this function returns (see startCore()), which re-reads the current
 * site theme regardless of whether a mutation was missed here, closing that
 * gap. Unlike wireLifecycle() above, nothing here depends on catching an
 * event emitted synchronously during init(), so this can stay attached only
 * once init() has resolved.
 */
function watchTheme(core: AgentletAPI): void {
	themeObserver = new MutationObserver(() => syncTheme(core));
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme'],
	});
}

function startCore(): Promise<AgentletAPI> {
	if (!corePromise) {
		corePromise = loadScript(CORE_URL).then(() => {
			const AgentletCoreCtor = window.AgentletCore?.default;
			if (!AgentletCoreCtor) {
				throw new Error('agentlet-core.min.js did not expose window.AgentletCore.default');
			}
			const core = new AgentletCoreCtor({
				registryUrl: REGISTRY_URL,
				pdfWorkerUrl: PDF_WORKER_URL,
				theme: themeFor(currentSiteTheme()),
			});
			// Before init(): see wireLifecycle()'s own doc comment for why this
			// cannot wait until init() resolves.
			wireLifecycle(core);
			return core.init().then(() => {
				lastAppliedTheme = currentSiteTheme();
				watchTheme(core);
				// Re-sync once more, now that the observer is live: catches a site
				// theme toggle that happened during the loading window above,
				// which the observer (just attached) could not have seen. See its
				// doc comment in watchTheme().
				syncTheme(core);
				return core;
			});
		});
	}
	return corePromise;
}

/** Opens the demo from a standing start: the hero button and the bookmarklet. */
export function openAgentletDemo(): void {
	writeActive(DEFAULT_MODULE);
	startCore()
		.then((core) => core.show())
		.catch((error: unknown) => {
			console.error('Could not start the live demo.', error);
			clearActive();
		});
}

window.__openAgentletDemo = openAgentletDemo;

// Reopen on this page load only if a previous page left the flag set.
// Reading sessionStorage is synchronous and free; nothing is downloaded
// when the flag is absent.
const previouslyActive = readActive();
if (previouslyActive) {
	startCore()
		.then(async (core) => {
			core.show();
			if (previouslyActive !== DEFAULT_MODULE) {
				// core.moduleRegistry (ModuleRegistryAPI), not core.modules: both
				// agree on every registered module, but only moduleRegistry also
				// exposes loadModule()/getRegistryEntries(), needed just below for
				// a lazy demo entry (src/agentlets/manifest.ts's `lazy` field).
				let instance = core.moduleRegistry.get(previouslyActive);
				if (!instance) {
					// The previously active module may be a lazy entry
					// (src/agentlets/launcher.ts's "Try it" loads one the same
					// way): init()'s eager registry load skipped it, so it is
					// not registered yet on this fresh page load. Load it before
					// deciding whether to restore it; getRegistryEntries() lists
					// every entry the registry has seen, loaded or not.
					const entry = core.moduleRegistry.getRegistryEntries().find((candidate) => candidate.name === previouslyActive);
					if (entry) {
						try {
							instance = await core.moduleRegistry.loadModule(entry);
						} catch (error) {
							console.error(`Could not load the previously active demo (${previouslyActive}).`, error);
						}
					}
				}
				// Only force the previously active module back if its own
				// patterns still match this page. ModuleRegistry registers
				// every module from the registry during core.init() above, and
				// each registration already runs checkUrlChange()
				// (agentlet-core src/core/ModuleRegistry.ts), which activates
				// whichever registered module's pattern matches the current
				// URL (or none). Restoring blindly here would override that
				// correct, pattern-based choice, e.g. keeping a non-docs demo
				// active after navigating into /docs/ (or the docs companion
				// active after navigating back out of /docs/), instead of
				// letting that auto-detection hand control to the module that
				// actually belongs on this page.
				if (instance && instance.checkPattern(window.location.href)) {
					void core.moduleRegistry.activateModule(instance);
				}
			}
		})
		.catch((error: unknown) => {
			console.error('Could not restore the live demo.', error);
			clearActive();
		});
}
