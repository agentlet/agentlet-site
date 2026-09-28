import { AGENTLET_MANIFEST, AUDIENCE_LABELS, listDemoAgentlets, type AgentletManifestEntry } from './manifest';
import { AGENTLET_BASE_STYLES, SHOW_LAUNCHER_EVENT, sourceLinkHtml, sourceUrl } from './shared';

const LAUNCHER_FILE = 'launcher';
const LAUNCHER_TITLE = AGENTLET_MANIFEST.find((entry) => entry.id === 'launcher')?.title ?? 'Live demo';

/**
 * The launcher is itself an agentlet, built and served the same way as any
 * demo it lists. Its panel shows the demo agentlets from the registry
 * (name, one sentence, audience) and switches the active module when one
 * is picked.
 *
 * Pattern: matches every page except /docs/ and below. Patterns are OR-ed
 * (AgentletModule.checkPattern uses Array.prototype.some, see
 * agentlet-core src/core/Module.ts), so two entries could never express "A
 * but not B". A single regex entry can, though: `{type: 'regex', value}` is
 * tested with a plain `new RegExp(value).test(url)` against the full URL,
 * and a negative lookahead expresses the exclusion directly, so no
 * imperative gate is needed here.
 */
const NOT_DOCS_PATTERN = '^(?!.*\\/docs(?:\\/|$)).*$';

class AgentletLauncherModule extends window.agentlet.Module {
	private _onShowLauncher: (() => void) | null = null;

	constructor() {
		super({
			name: 'launcher',
			description: 'Try a demo agentlet on this page.',
			patterns: [{ type: 'regex', value: NOT_DOCS_PATTERN }],
		});
	}

	async initModule(): Promise<void> {
		// Site-owned convention, not a core API: any module can ask to bring
		// the launcher back by dispatching SHOW_LAUNCHER_EVENT on window (see
		// shared.ts). There is no public way to reach "the launcher" other
		// than by name, which this closes over. See the comment on
		// _activate() below for why that lookup goes through
		// window.agentlet.moduleRegistry.get() rather than the documented
		// window.agentlet.modules.get().
		this._onShowLauncher = () => {
			const registry = window.agentlet?.moduleRegistry;
			const self = registry?.get(this.name);
			if (registry && self) void registry.activateModule(self);
		};
		window.addEventListener(SHOW_LAUNCHER_EVENT, this._onShowLauncher);
	}

	async cleanupModule(): Promise<void> {
		if (this._onShowLauncher) {
			window.removeEventListener(SHOW_LAUNCHER_EVENT, this._onShowLauncher);
			this._onShowLauncher = null;
		}
	}

	/**
	 * Duck-typed hook the core looks for (agentlet-core src/index.ts,
	 * updateApplicationDisplay()): labels the panel header instead of
	 * falling back to `this.name` ("launcher", lowercase and hyphenated).
	 */
	getPanelTitle(): string {
		return LAUNCHER_TITLE;
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES);
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _render(): string {
		const demos = listDemoAgentlets();
		const list = demos.length
			? `<ul class="agentlet-demo-list">${demos.map((entry) => this._renderDemo(entry)).join('')}</ul>`
			: '<p class="agentlet-empty-state">The first demos are on their way.</p>';

		return `
			<div class="agentlet-panel-body">
				<h3>Try a demo</h3>
				<p>Pick a demo agentlet below. Each one runs on this page.</p>
				${list}
				${sourceLinkHtml(LAUNCHER_FILE)}
			</div>
		`;
	}

	private _renderDemo(entry: AgentletManifestEntry): string {
		const audienceLabel = entry.audience ? AUDIENCE_LABELS[entry.audience] : '';
		return `
			<li class="agentlet-demo-card" data-demo="${entry.id}">
				<div class="agentlet-demo-card-head">
					<span class="agentlet-demo-title">${entry.title}</span>
					${audienceLabel ? `<span class="agentlet-audience-pill">${audienceLabel}</span>` : ''}
				</div>
				<p class="agentlet-demo-description">${entry.description}</p>
				<div class="agentlet-demo-actions">
					<button type="button" class="agentlet-try-button" data-try="${entry.id}">Try it</button>
					<a class="agentlet-demo-source-link" href="${sourceUrl(entry.file)}" target="_blank" rel="noopener noreferrer">View source</a>
				</div>
			</li>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelectorAll<HTMLButtonElement>('[data-try]').forEach((button) => {
			button.addEventListener('click', () => {
				const id = button.dataset.try;
				if (id) this._activate(id);
			});
		});
	}

	/**
	 * "Load and activate": since this lot's registry lists every agentlet
	 * (launcher and, later, each demo) as a top-level entry, AgentletCore's
	 * own ModuleRegistry.initialize() already fetched and registered all of
	 * them before this panel could even mount (see ModuleRegistry.loadFromRegistry()
	 * in agentlet-core, awaited inside init()). So "activate" is the whole
	 * job here, and window.agentlet.moduleRegistry.activateModule() is public,
	 * part of the shipped ModuleRegistryAPI type, and does exactly this:
	 * deactivates the launcher (unmounting this panel) and mounts the chosen
	 * module instead.
	 *
	 * There is no public API gap for this step. The gap is one step earlier:
	 * ModuleRegistryAPI exposes no way to load a single extra module by name
	 * or URL after init() has already run (loadFromRegistry/loadAgentletModule/
	 * loadScript exist on the concrete ModuleRegistry class but are not part
	 * of the shipped ModuleRegistryAPI type). That only matters once there are
	 * enough demos that eagerly downloading all of them at init is wasteful;
	 * see the build report for the precise gap to file against agentlet-core.
	 *
	 * Looks the instance up on `moduleRegistry`, not on `window.agentlet.modules`
	 * (a core bug/gap worked around here, found while wiring up the first real
	 * demo agentlet: GlobalAPI.ts's `window.agentlet.modules.get()` reads from
	 * `core.moduleManager` when one exists, falling back to `moduleRegistry`
	 * only when it does not. AgentletCore always constructs a `moduleManager`,
	 * so that fallback never triggers - but `ModuleRegistry.loadAgentletModule()`
	 * (the path every registry-script-loaded agentlet, including every demo
	 * here, goes through) only ever calls `this.register()` on itself, never
	 * on `moduleManager`. So `window.agentlet.modules.get(id)` returns
	 * `undefined` for every module loaded this way, even right after the
	 * registry logged it as registered. `moduleRegistry.get()` is part of the
	 * shipped `ModuleRegistryAPI` type and reads from the map that actually
	 * holds these instances, so it works. See the build report for the exact
	 * repro to file against agentlet-core.
	 */
	private _activate(id: string): void {
		const registry = window.agentlet?.moduleRegistry;
		const instance = registry?.get(id);
		if (!registry || !instance) {
			window.agentlet?.utils.MessageBubble.error(
				`This demo could not be loaded (${id}). Reload the page and try again.`,
			);
			return;
		}

		// The launcher's own pattern excludes /docs/ (NOT_DOCS_PATTERN above),
		// so it can only ever be open on a page some other demo's pattern
		// might not match too (the docs companion in particular: its pattern
		// is /docs/ and below only, the exact pages the launcher never shows
		// on). Rather than activating a module on a page it was not built
		// for, check its own Module.checkPattern() (the same check
		// ModuleRegistry.findMatchingModule() runs) and offer to go to a page
		// where it does apply instead.
		if (!instance.checkPattern(window.location.href)) {
			const entry = AGENTLET_MANIFEST.find((candidate) => candidate.id === id);
			window.agentlet?.utils.Dialog.showInfo(
				{
					title: entry?.title ?? 'This demo',
					icon: '',
					message: `${entry?.title ?? 'This demo'} only runs on the documentation. Open the docs to try it.`,
					buttons: [
						{ text: 'Cancel', value: 'cancel' },
						{ text: 'Go to the docs', value: 'go-to-docs', primary: true },
					],
				},
				(value) => {
					if (value === 'go-to-docs') window.location.href = '/docs/';
				},
			);
			return;
		}

		void registry.activateModule(instance);
	}
}

(window as unknown as Record<string, unknown>).AgentletLauncherModule = AgentletLauncherModule;
