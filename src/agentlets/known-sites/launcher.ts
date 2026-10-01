import { listenForShowLauncher, sourceLinkHtml } from '../shared';
import { KNOWN_SITES, KNOWN_SITE_AGENTLETS, demosForUrl, findKnownSite, type KnownSiteAgentlet } from './manifest';
import { KNOWN_SITES_PAGE_URL, KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, escapeHtml } from './shared';

/**
 * The launcher of the known-sites bookmarklet. It is the only agentlet the
 * registry loads eagerly; its pattern matches every page, so it is what a
 * visitor sees first unless the loader opens a site demo directly (see
 * src/scripts/known-sites-loader.ts).
 *
 * On a supported site it lists that site's demos. Anywhere else it says so
 * and lists the supported sites with an example link each.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/launcher`;
const ANY_PAGE_PATTERN = '^.*$';

const STYLES = `
.kl-sites {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.kl-site {
	border: 1px solid var(--color-surface-border);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface);
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.kl-site-name {
	font-weight: 600;
	color: var(--color-heading);
}

.kl-site-where {
	font-size: 0.85rem;
}

.kl-link {
	color: var(--color-heading);
	font-size: 0.85rem;
	text-decoration: underline;
	text-decoration-color: var(--color-accent);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
}
`;

class KnownSitesLauncherModule extends window.agentlet.Module {
	constructor() {
		super({
			name: 'known-sites-launcher',
			description: 'Lists the demos available on this site, or the supported sites.',
			patterns: [{ type: 'regex', value: ANY_PAGE_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Agentlet demos';
	}

	async initModule(): Promise<void> {
		// Same convention as the on-site launcher: any demo's "Back to all
		// demos" button dispatches this event (see shared.ts).
		listenForShowLauncher(this.name);
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _render(): string {
		const demos = demosForUrl(window.location.href);
		return demos.length > 0 ? this._renderDemos(demos) : this._renderSupportedSites();
	}

	private _renderDemos(demos: KnownSiteAgentlet[]): string {
		const site = findKnownSite(demos[0].site);
		const cards = demos
			.map(
				(entry) => `
					<li class="agentlet-demo-card" data-demo="${entry.id}">
						<div class="agentlet-demo-card-head">
							<span class="agentlet-demo-title">${escapeHtml(entry.title)}</span>
						</div>
						<p class="agentlet-demo-description">${escapeHtml(entry.description)}</p>
						<div class="agentlet-demo-actions">
							<button type="button" class="agentlet-try-button" data-try="${entry.id}">Try it</button>
						</div>
					</li>
				`,
			)
			.join('');
		return `
			<div class="agentlet-panel-body">
				<h3>${site ? `Demos for ${escapeHtml(site.label)}` : 'Demos for this page'}</h3>
				<p class="ks-intro">Pick a demo. Each one only reads this page in your browser. Nothing is posted and nothing is sent anywhere.</p>
				<ul class="agentlet-demo-list">${cards}</ul>
				${sourceLinkHtml(FILE)}
			</div>
		`;
	}

	private _renderSupportedSites(): string {
		const sites = KNOWN_SITES.map((site) => {
			const demos = KNOWN_SITE_AGENTLETS.filter((entry) => entry.site === site.id);
			return `
				<li class="kl-site">
					<span class="kl-site-name">${escapeHtml(site.label)}</span>
					<span class="kl-site-where">${escapeHtml(site.where)}</span>
					<span class="ks-note">${demos.map((entry) => escapeHtml(entry.title)).join(', ')}</span>
					<a class="kl-link" href="${escapeHtml(site.exampleUrl)}" rel="noopener noreferrer">${escapeHtml(site.exampleLabel)}</a>
				</li>
			`;
		}).join('');
		return `
			<div class="agentlet-panel-body">
				<h3>No demo for this page</h3>
				<p class="ks-intro">
					These demos run on a few well-known sites. Open one of the pages below and click the
					bookmarklet again.
				</p>
				<ul class="kl-sites">${sites}</ul>
				<p class="ks-note">
					Some sites block scripts added by a bookmarklet. <a class="kl-link" href="${KNOWN_SITES_PAGE_URL}" rel="noopener noreferrer">Read the limits</a>.
				</p>
				${sourceLinkHtml(FILE)}
			</div>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelectorAll<HTMLButtonElement>('[data-try]').forEach((button) => {
			button.addEventListener('click', () => {
				const id = button.dataset.try;
				if (id) void this._activate(id, button);
			});
		});
	}

	/** Loads the demo's bundle if it is not loaded yet (the registry marks demos lazy), then activates it. */
	private async _activate(id: string, button: HTMLButtonElement): Promise<void> {
		const registry = window.agentlet?.moduleRegistry;
		if (!registry) return;

		let instance = registry.get(id);
		if (!instance) {
			const entry = registry.getRegistryEntries().find((candidate) => candidate.name === id);
			if (!entry) {
				window.agentlet?.utils.MessageBubble.error(`This demo could not be loaded (${id}). Reload the page and try again.`);
				return;
			}
			const label = button.textContent;
			button.disabled = true;
			button.textContent = 'Loading...';
			try {
				instance = await registry.loadModule(entry);
			} catch (error) {
				button.disabled = false;
				button.textContent = label;
				const detail = error instanceof Error ? error.message : String(error);
				window.agentlet?.utils.MessageBubble.error(`Could not load this demo (${id}). ${detail}`);
				return;
			}
		}
		void registry.activateModule(instance);
	}
}

(window as unknown as Record<string, unknown>).KnownSitesLauncherModule = KnownSitesLauncherModule;
