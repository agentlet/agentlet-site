import { AGENTLET_MANIFEST, AUDIENCE_LABELS, listDemoAgentlets, type AgentletManifestEntry } from './manifest';
import { AGENTLET_BASE_STYLES, SHOW_LAUNCHER_EVENT, sourceLinkHtml, sourceUrl } from './shared';
import { AUTH_CHANGED_EVENT, configureDemoAuth, getDemoAuthUser, signOut, startSignIn, type DemoAuthUser } from './auth-demo';

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

/**
 * Extra panel styles for the lock/unlock UI, on top of AGENTLET_BASE_STYLES:
 * the auth status banner shown above the demo list, and the lock badge on a
 * `requiresSignIn` card (src/agentlets/manifest.ts, src/agentlets/
 * auth-demo.ts). Kept local to this file, the same way expense-receipt.ts
 * and page-audit.ts each keep their own extra STYLES rather than growing
 * shared.ts's base set.
 */
const STYLES = `
.agentlet-auth-banner {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px 14px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 10px;
	font-size: 0.85rem;
}

.agentlet-auth-banner p {
	margin: 0;
}

.agentlet-link-button {
	appearance: none;
	background: none;
	border: none;
	padding: 0;
	font: inherit;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--color-heading, #0f3350);
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
	cursor: pointer;
	align-self: flex-start;
}

.agentlet-lock-badge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--color-surface-border, #d9e0e6);
	color: var(--color-text-muted, #5b6b78);
	white-space: nowrap;
}

.agentlet-lock-badge svg {
	width: 10px;
	height: 10px;
	flex-shrink: 0;
}

.agentlet-demo-actions button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
`;

const LOCK_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

class AgentletLauncherModule extends window.agentlet.Module {
	private _container: HTMLElement | null = null;
	private _onShowLauncher: (() => void) | null = null;
	private _onAuthChanged: (() => void) | null = null;
	/** True while a sign-in popup was just requested and has not settled yet (success, error, or cancel); see auth-demo.ts's AUTH_CHANGED_EVENT. */
	private _authBusy = false;

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
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);

		// Wired here, not in initModule(): agentlet-core's Module.init() only
		// ever calls initModule() once per instance (it guards against a
		// second call), but mount()/unmount() run on every activation. A
		// listener added in initModule() would work the first time the
		// launcher is shown, then silently stop firing after it is ever
		// deactivated (e.g. to open a different demo) and reactivated,
		// since cleanupModule() removed it and initModule() never runs
		// again to add it back. Configured here too, not only in
		// enterprise-sign-in.ts's own mount(): either module could mount
		// first (a fresh page load can restore a previously active module
		// directly, see src/scripts/demo-loader.ts, without going through
		// this launcher), and a locked card's "Sign in to try" must work
		// even if the visitor never opens the "Enterprise sign-in" demo.
		configureDemoAuth();
		this._onAuthChanged = () => {
			this._authBusy = false;
			this._rerender();
		};
		window.addEventListener(AUTH_CHANGED_EVENT, this._onAuthChanged);
	}

	async unmount(): Promise<void> {
		this._container = null;
		if (this._onAuthChanged) {
			window.removeEventListener(AUTH_CHANGED_EVENT, this._onAuthChanged);
			this._onAuthChanged = null;
		}
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _escape(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	private _render(): string {
		const demos = listDemoAgentlets();
		const user = getDemoAuthUser();
		const list = demos.length
			? `<ul class="agentlet-demo-list">${demos.map((entry) => this._renderDemo(entry, user)).join('')}</ul>`
			: '<p class="agentlet-empty-state">The first demos are on their way.</p>';
		const hasLockedDemos = demos.some((entry) => entry.requiresSignIn);

		return `
			<div class="agentlet-panel-body">
				<h3>Try a demo</h3>
				<p>Pick a demo agentlet below. Each one runs on this page.</p>
				${hasLockedDemos ? this._renderAuthBanner(user) : ''}
				${list}
				${sourceLinkHtml(LAUNCHER_FILE)}
			</div>
		`;
	}

	private _renderAuthBanner(user: DemoAuthUser | null): string {
		if (user) {
			return `
				<div class="agentlet-auth-banner">
					<p>Signed in as <strong>${this._escape(user.name)}</strong> (${this._escape(user.role)}). The locked demos below are unlocked.</p>
					<button type="button" class="agentlet-link-button" data-action="sign-out">Sign out</button>
				</div>
			`;
		}
		return `
			<div class="agentlet-auth-banner">
				<p>Some demos below need a simulated company sign-in.</p>
				<button type="button" class="agentlet-try-button" data-action="sign-in" ${this._authBusy ? 'disabled' : ''}>
					${this._authBusy ? 'Opening the sign-in popup...' : 'Sign in with your company account (simulated)'}
				</button>
			</div>
		`;
	}

	private _renderDemo(entry: AgentletManifestEntry, user: DemoAuthUser | null): string {
		const audienceLabel = entry.audience ? AUDIENCE_LABELS[entry.audience] : '';
		const locked = Boolean(entry.requiresSignIn) && !user;

		const primaryAction = locked
			? `<button type="button" class="agentlet-try-button" data-action="sign-in" ${this._authBusy ? 'disabled' : ''}>${this._authBusy ? 'Opening the sign-in popup...' : 'Sign in to try'}</button>`
			: `<button type="button" class="agentlet-try-button" data-try="${entry.id}">Try it</button>`;

		return `
			<li class="agentlet-demo-card" data-demo="${entry.id}">
				<div class="agentlet-demo-card-head">
					<span class="agentlet-demo-title">${entry.title}</span>
					${locked ? `<span class="agentlet-lock-badge">${LOCK_ICON}Locked</span>` : ''}
					${audienceLabel ? `<span class="agentlet-audience-pill">${audienceLabel}</span>` : ''}
				</div>
				<p class="agentlet-demo-description">${entry.description}</p>
				<div class="agentlet-demo-actions">
					${primaryAction}
					<a class="agentlet-demo-source-link" href="${sourceUrl(entry.file, entry.fileExt)}" target="_blank" rel="noopener noreferrer">View source</a>
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
		container.querySelectorAll<HTMLButtonElement>('[data-action="sign-in"]').forEach((button) => {
			button.addEventListener('click', () => {
				this._authBusy = true;
				this._rerender();
				startSignIn();
			});
		});
		container.querySelector('[data-action="sign-out"]')?.addEventListener('click', () => {
			signOut();
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
