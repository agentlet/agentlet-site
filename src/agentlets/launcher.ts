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
		// than by name, which this closes over. Goes through
		// window.agentlet.moduleRegistry rather than the equivalent
		// window.agentlet.modules: both agree on every registered module, but
		// only moduleRegistry also exposes loadModule()/getRegistryEntries(),
		// which _activate() below needs for the lazy demo entries, so this
		// file sticks to one namespace throughout rather than mixing both.
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
				if (id) void this._activate(id, button);
			});
		});
	}

	/**
	 * "Load (if needed) and activate". The expense-receipt and page-audit
	 * manifest entries are marked `lazy: true` (see manifest.ts and
	 * scripts/build-cdn.mjs's buildRegistry()), so ModuleRegistry.initialize()
	 * skips them at startup: registry.get(id) returns null for either until
	 * something calls loadModule() on their registry entry. The docs
	 * companion stays eager (it needs to be already registered for the
	 * core's own URL-pattern detection to pick it up on a direct /docs/
	 * visit, not only from this launcher), so registry.get() already
	 * resolves it and the loading branch below is a no-op for it.
	 *
	 * getRegistryEntries() lists every entry the registry has seen,
	 * loaded or not, each annotated with `loaded`; that is where this reads
	 * the `AgentletRegistryEntry` (name/url/module) loadModule() needs, so
	 * no second copy of that shape has to live in this file.
	 */
	private async _activate(id: string, button: HTMLButtonElement): Promise<void> {
		const registry = window.agentlet?.moduleRegistry;
		if (!registry) {
			window.agentlet?.utils.MessageBubble.error(
				`This demo could not be loaded (${id}). Reload the page and try again.`,
			);
			return;
		}

		let instance = registry.get(id);

		if (!instance) {
			const entry = registry.getRegistryEntries().find((candidate) => candidate.name === id);
			if (!entry) {
				window.agentlet?.utils.MessageBubble.error(
					`This demo could not be loaded (${id}). Reload the page and try again.`,
				);
				return;
			}

			const originalLabel = button.textContent;
			button.disabled = true;
			button.textContent = 'Loading...';
			try {
				instance = await registry.loadModule(entry);
			} catch (error) {
				button.disabled = false;
				button.textContent = originalLabel;
				const detail = error instanceof Error ? error.message : String(error);
				window.agentlet?.utils.MessageBubble.error(`Could not load this demo (${id}). ${detail}`);
				return;
			}
			button.disabled = false;
			button.textContent = originalLabel;
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
