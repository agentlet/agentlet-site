import { useMemo, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AgentletAPI, AgentletTheme, EventBusAPI, ModuleMountContext } from 'agentlet-core';
import { AGENTLET_BASE_STYLES, isDocsPage, requestShowLauncher, sourceUrl } from './shared';

/**
 * "Live white label": rebrands the whole agentlet panel (header, accent,
 * font, corner radius, small logo) between three fictitious companies using
 * the core's `setTheme()`, with the panel content itself mounted as a React
 * tree through the mount API (see /docs/guides/mount-api/). Every page
 * except /docs/ and below, same pattern as launcher.ts.
 *
 * This is the one demo agentlet that bundles a UI framework: React and
 * ReactDOM are bundled into this module's own IIFE by esbuild (see the
 * `.tsx` entry point handling and `jsx: 'automatic'` option added to
 * scripts/build-cdn.mjs for this), never as a page-level global and never
 * pulled into any other agentlet's bundle, since each manifest entry gets
 * its own isolated esbuild build() call.
 */

const FILE = 'white-label';
// shared.ts's sourceUrl() defaults to a `.ts` extension (every other
// agentlet module is a plain .ts file); pass the manifest's own `fileExt`
// ('tsx') so this one still links to the file that actually exists.
const SOURCE_URL = sourceUrl(FILE, 'tsx');
const STORAGE_KEY = 'agentlet:white-label-company';
const DEMO_SECTION_URL = '/#demo';

// Mirrors launcher.ts's own NOT_DOCS_PATTERN: every page except /docs/ and
// below. Not imported from launcher.ts: each agentlet bundle is built from
// its own entry point (see scripts/build-cdn.mjs), and importing from
// launcher.ts would pull its whole module (and its own class registration)
// into this one.
const NOT_DOCS_PATTERN = '^(?!.*\\/docs(?:\\/|$)).*$';

type CompanyId = 'freight' | 'health' | 'bank';
type SiteMode = 'light' | 'dark';

interface CompanyDefinition {
	id: CompanyId;
	name: string;
	themes: Record<SiteMode, Partial<AgentletTheme>>;
}

function isCompanyId(value: unknown): value is CompanyId {
	return value === 'freight' || value === 'health' || value === 'bank';
}

// System font stacks only, no web font: one plain sans, one serif, one
// monospace, so the three companies read as visibly different typefaces
// without loading anything.
const FREIGHT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const HEALTH_FONT = 'Georgia, "Times New Roman", ui-serif, serif';
const BANK_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

/**
 * Three fictitious companies, invented for this demo. Names are chosen to
 * be obviously made up and unlikely to collide with a real company. No real
 * brand, no trademark: colours and shapes below are generic, not copied
 * from any real identity.
 */
const COMPANIES: CompanyDefinition[] = [
	{
		id: 'freight',
		name: 'Fictional Freight Co',
		themes: {
			light: {
				primaryColor: '#d97706',
				secondaryColor: '#1f2937',
				backgroundColor: '#ffffff',
				contentBackground: '#f3f4f6',
				textColor: '#1f2937',
				borderColor: '#d1d5db',
				headerBackground: '#1f2937',
				headerTextColor: '#ffffff',
				actionButtonBackground: '#d97706',
				actionButtonBorder: '#d97706',
				actionButtonHover: '#b45309',
				actionButtonText: '#1f2937',
				borderRadius: '2px',
				fontFamily: FREIGHT_FONT,
			},
			dark: {
				primaryColor: '#d97706',
				secondaryColor: '#1f2937',
				backgroundColor: '#111827',
				contentBackground: '#1f2937',
				textColor: '#e5e7eb',
				borderColor: '#374151',
				headerBackground: '#d97706',
				headerTextColor: '#111827',
				actionButtonBackground: '#d97706',
				actionButtonBorder: '#d97706',
				actionButtonHover: '#f59e0b',
				actionButtonText: '#111827',
				borderRadius: '2px',
				fontFamily: FREIGHT_FONT,
			},
		},
	},
	{
		id: 'health',
		name: 'Example Health Group',
		themes: {
			light: {
				primaryColor: '#14b8a6',
				secondaryColor: '#134e4a',
				backgroundColor: '#ffffff',
				contentBackground: '#f0fdfa',
				textColor: '#134e4a',
				borderColor: '#99f6e4',
				headerBackground: '#0d9488',
				headerTextColor: '#ffffff',
				actionButtonBackground: '#14b8a6',
				actionButtonBorder: '#14b8a6',
				actionButtonHover: '#0f766e',
				actionButtonText: '#ffffff',
				borderRadius: '18px',
				fontFamily: HEALTH_FONT,
			},
			dark: {
				primaryColor: '#2dd4bf',
				secondaryColor: '#0b3b38',
				backgroundColor: '#042f2e',
				contentBackground: '#0b3b38',
				textColor: '#ccfbf1',
				borderColor: '#115e59',
				headerBackground: '#2dd4bf',
				headerTextColor: '#042f2e',
				actionButtonBackground: '#2dd4bf',
				actionButtonBorder: '#2dd4bf',
				actionButtonHover: '#5eead4',
				actionButtonText: '#042f2e',
				borderRadius: '18px',
				fontFamily: HEALTH_FONT,
			},
		},
	},
	{
		id: 'bank',
		name: 'Sample Bank',
		themes: {
			light: {
				primaryColor: '#a16207',
				secondaryColor: '#1e3a5f',
				backgroundColor: '#ffffff',
				contentBackground: '#f8fafc',
				textColor: '#1e293b',
				borderColor: '#cbd5e1',
				headerBackground: '#1e3a5f',
				headerTextColor: '#ffffff',
				actionButtonBackground: '#a16207',
				actionButtonBorder: '#a16207',
				actionButtonHover: '#854d0e',
				actionButtonText: '#ffffff',
				borderRadius: '4px',
				fontFamily: BANK_FONT,
			},
			dark: {
				primaryColor: '#ca8a04',
				secondaryColor: '#1e293b',
				backgroundColor: '#0f172a',
				contentBackground: '#1e293b',
				textColor: '#e2e8f0',
				borderColor: '#334155',
				headerBackground: '#ca8a04',
				headerTextColor: '#0f172a',
				actionButtonBackground: '#ca8a04',
				actionButtonBorder: '#ca8a04',
				actionButtonHover: '#eab308',
				actionButtonText: '#0f172a',
				borderRadius: '4px',
				fontFamily: BANK_FONT,
			},
		},
	},
];

/**
 * The agentlet brand theme, light and dark. Duplicated by value from
 * src/scripts/demo-loader.ts's own LIGHT_THEME/DARK_THEME (which itself
 * already duplicates src/styles/landing.css by value, for the same reason:
 * each module here is bundled on its own by scripts/build-cdn.mjs, and
 * importing demo-loader.ts would pull in its side effects, such as the
 * reopen check that runs at import time, not just its two theme constants).
 * Must be kept in sync by hand if the brand kit changes.
 */
const AGENTLET_BRAND_THEME: Record<SiteMode, Partial<AgentletTheme>> = {
	light: {
		primaryColor: '#f4a261',
		secondaryColor: '#0f3350',
		backgroundColor: '#ffffff',
		contentBackground: '#f4f6f8',
		textColor: '#3d4f5e',
		borderColor: '#d9e0e6',
		headerBackground: '#0f3350',
		headerTextColor: '#ffffff',
		actionButtonBackground: '#f4a261',
		actionButtonBorder: '#f4a261',
		actionButtonHover: '#f7b47c',
		actionButtonText: '#0f3350',
		borderRadius: '8px',
		fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	},
	dark: {
		primaryColor: '#f4a261',
		secondaryColor: '#16293a',
		backgroundColor: '#0b1a26',
		contentBackground: '#16293a',
		textColor: '#e6edf2',
		borderColor: '#24394d',
		headerBackground: '#f4a261',
		headerTextColor: '#0f3350',
		actionButtonBackground: '#f4a261',
		actionButtonBorder: '#f4a261',
		actionButtonHover: '#f7b47c',
		actionButtonText: '#0f3350',
		borderRadius: '8px',
		fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
	},
};

/** Mirrors demo-loader.ts's own currentSiteTheme(): the site's data-theme attribute, defaulting to dark. */
function currentSiteMode(): SiteMode {
	return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function companyName(id: CompanyId | null): string {
	if (id === null) return 'Agentlet brand';
	return COMPANIES.find((company) => company.id === id)?.name ?? 'Agentlet brand';
}

/** Small inline logo, generic geometric shapes only, colour driven by the active theme so it always reads against the header. */
function CompanyLogo({ id, color }: { id: CompanyId | 'brand'; color: string }): ReactElement {
	switch (id) {
		case 'freight':
			return (
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
					<rect x="3" y="7" width="18" height="12" rx="1.5" fill="none" stroke={color} strokeWidth="2" />
					<path d="M3 7l9 6 9-6" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
				</svg>
			);
		case 'health':
			return (
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
					<circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" />
					<path d="M12 8v8M8 12h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
				</svg>
			);
		case 'bank':
			return (
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
					<path d="M12 3l9 5H3z" fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
					<path d="M5 10v8M10 10v8M14 10v8M19 10v8M4 20h16" stroke={color} strokeWidth="2" strokeLinecap="round" />
				</svg>
			);
		default:
			return (
				<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
					<circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="2" />
					<circle cx="12" cy="12" r="3" fill={color} />
				</svg>
			);
	}
}

interface PanelProps {
	activeCompanyId: CompanyId | null;
	siteMode: SiteMode;
	theme: AgentletTheme;
	onSelect: (id: CompanyId) => void;
	onReset: () => void;
}

function WhiteLabelPanel({ activeCompanyId, siteMode, theme, onSelect, onReset }: PanelProps): ReactElement {
	const previewHeaderRadius = useMemo(() => `${theme.borderRadius} ${theme.borderRadius} 0 0`, [theme.borderRadius]);

	return (
		<div className="agentlet-panel-body wl-panel">
			<h3>Live white label</h3>
			<p className="wl-intro">
				Rebrands the whole agentlet panel through the core theme API: header colour, accent, font, and
				corner radius all change together. Pick a company below, or reset to the agentlet brand.
			</p>
			<p className="wl-fictitious-note">
				Fictitious companies invented for this demo. They are not real businesses.
			</p>

			<p className="wl-active-theme">
				Active theme: <strong className="wl-active-theme-label">{companyName(activeCompanyId)} ({siteMode})</strong>
			</p>

			<div className="wl-company-grid">
				{COMPANIES.map((company) => (
					<button
						key={company.id}
						type="button"
						className={`wl-company-button${activeCompanyId === company.id ? ' is-active' : ''}`}
						data-select-company={company.id}
						onClick={() => onSelect(company.id)}
					>
						<CompanyLogo id={company.id} color={activeCompanyId === company.id ? theme.headerTextColor : theme.textColor} />
						<span>{company.name}</span>
					</button>
				))}
			</div>

			<button
				type="button"
				className="wl-reset-button"
				data-action="reset-brand"
				onClick={onReset}
				disabled={activeCompanyId === null}
			>
				Reset to agentlet brand
			</button>

			<div
				className="wl-preview"
				style={{ fontFamily: theme.fontFamily, borderColor: theme.borderColor, borderRadius: theme.borderRadius }}
			>
				<div
					className="wl-preview-header"
					style={{ background: theme.headerBackground, color: theme.headerTextColor, borderRadius: previewHeaderRadius }}
				>
					<CompanyLogo id={activeCompanyId ?? 'brand'} color={theme.headerTextColor} />
					<span>{companyName(activeCompanyId)}</span>
				</div>
				<div className="wl-preview-body" style={{ background: theme.contentBackground }}>
					<p style={{ color: theme.textColor }}>Sample panel copy styled by the active theme.</p>
					<button
						type="button"
						className="wl-preview-action"
						style={{
							background: theme.actionButtonBackground,
							borderColor: theme.actionButtonBorder,
							color: theme.actionButtonText,
							borderRadius: theme.borderRadius,
						}}
					>
						Sample action
					</button>
					<div
						className="wl-preview-card"
						style={{
							background: theme.backgroundColor,
							borderColor: theme.borderColor,
							borderRadius: theme.borderRadius,
							color: theme.textColor,
						}}
					>
						Sample card content.
					</div>
				</div>
			</div>

			<a className="agentlet-source-link" href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
				View the source of this agentlet
			</a>
			{isDocsPage() ? (
				<p className="agentlet-back-to-demos-note">The full list of demos is on the rest of the site, not the docs.</p>
			) : (
				<button type="button" className="agentlet-back-to-demos" onClick={() => requestShowLauncher()}>
					Back to all demos
				</button>
			)}
		</div>
	);
}

const STYLES = `
.wl-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.wl-fictitious-note {
	font-size: 0.8rem;
	font-style: italic;
	color: var(--color-text-muted, #5b6b78);
}

.wl-active-theme {
	font-size: 0.9rem;
}

.wl-active-theme-label {
	color: var(--color-heading, #0f3350);
}

.wl-company-grid {
	display: grid;
	grid-template-columns: repeat(3, 1fr);
	gap: 8px;
}

.wl-company-button {
	appearance: none;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 6px;
	border: 1.5px solid var(--color-surface-border, #d9e0e6);
	border-radius: 8px;
	background: var(--color-surface, #f4f6f8);
	color: var(--color-text, #3d4f5e);
	font: inherit;
	font-size: 0.78rem;
	text-align: center;
	padding: 10px 6px;
	cursor: pointer;
}

.wl-company-button.is-active {
	border-color: var(--color-accent, #f4a261);
	background: var(--color-badge-bg, #fde8d7);
	font-weight: 600;
}

.wl-reset-button {
	appearance: none;
	align-self: flex-start;
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
}

.wl-reset-button:disabled {
	color: var(--color-text-muted, #5b6b78);
	text-decoration-color: var(--color-text-muted, #5b6b78);
	cursor: not-allowed;
}

.wl-preview {
	border: 1px solid;
	overflow: hidden;
}

.wl-preview-header {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	font-weight: 600;
}

.wl-preview-body {
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.wl-preview-action {
	appearance: none;
	border: 1.5px solid;
	padding: 6px 14px;
	font: inherit;
	font-weight: 600;
	font-size: 0.85rem;
	align-self: flex-start;
	cursor: pointer;
}

.wl-preview-card {
	border: 1px solid;
	padding: 10px;
	font-size: 0.85rem;
}
`;

class WhiteLabelModule extends window.agentlet.Module {
	private _root: Root | null = null;
	private _api: AgentletAPI | null = null;
	private _eventBus: EventBusAPI | null = null;
	private _activeCompany: CompanyId | null = null;
	private _storageLoaded = false;
	/**
	 * True for the duration of a setTheme() call this module itself made
	 * (company switch, reset, or reapplying its own theme after a foreign
	 * change). `theme:changed` fires synchronously from inside setTheme(),
	 * so `_handleThemeChanged` below can tell its own changes apart from a
	 * foreign one (see the doc comment there) without any timing assumption.
	 */
	private _applyingOwnTheme = false;
	/** MessageBubble closing line: shown once, the first time a company theme is picked (not on reset). */
	private _shownRealAppBubble = false;

	constructor() {
		super({
			name: 'white-label',
			description: 'Switches the whole agentlet panel between fictitious company brand themes.',
			patterns: [{ type: 'regex', value: NOT_DOCS_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Live white label';
	}

	async mount(container: HTMLElement, context: ModuleMountContext): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._api = context.api;

		// Read the saved company once per module instance (not on every
		// remount: mount()/unmount() run again on every URL change while
		// this module stays active, see src/content/docs/docs/guides/
		// mount-api.md's lifecycle order, and re-reading plus re-applying on
		// each of those would be wasted work).
		if (!this._storageLoaded) {
			this._storageLoaded = true;
			const saved = context.api.storage.local.get(STORAGE_KEY);
			if (isCompanyId(saved)) this._activeCompany = saved;
		}
		if (this._activeCompany !== null) this._applyActiveCompanyTheme();

		this._eventBus = context.eventBus;
		this._eventBus.on('theme:changed', this._handleThemeChanged);

		this._root = createRoot(container);
		this._renderPanel();
	}

	async unmount(): Promise<void> {
		this._eventBus?.off('theme:changed', this._handleThemeChanged);
		this._eventBus = null;
		this._root?.unmount();
		this._root = null;
	}

	/**
	 * Runs whenever this module is actually deactivated: switching to a
	 * different module (including back to the launcher), or the whole panel
	 * closing (core.cleanup(), which deactivates the active module before
	 * tearing the rest down). Not the same as unmount(), which also runs on
	 * every URL change while this module stays active; cleanupModule() is
	 * the one hook that only fires when we are really leaving, so it is the
	 * right place for "restore the site brand theme when the visitor leaves
	 * this demo" without also restoring it on plain in-demo navigation.
	 */
	async cleanupModule(): Promise<void> {
		if (this._activeCompany !== null) this._applyTheme(AGENTLET_BRAND_THEME[currentSiteMode()]);
	}

	private _applyActiveCompanyTheme(): void {
		if (this._activeCompany === null) return;
		const company = COMPANIES.find((candidate) => candidate.id === this._activeCompany);
		if (!company) return;
		this._applyTheme(company.themes[currentSiteMode()]);
	}

	private _applyTheme(config: Partial<AgentletTheme>): void {
		if (!this._api) return;
		this._applyingOwnTheme = true;
		try {
			this._api.setTheme(config);
		} finally {
			this._applyingOwnTheme = false;
		}
	}

	/**
	 * Subscribed via the real eventBus API in mount(), unsubscribed in
	 * unmount() (see the mount API guide's "Reacting to a theme change").
	 *
	 * Also the fix for the one place this module could fight with
	 * src/scripts/demo-loader.ts: that file's own MutationObserver calls
	 * `core.setTheme()` with the site's brand theme every time the site's
	 * light/dark toggle flips `data-theme`, regardless of which module is
	 * active. Rather than changing demo-loader.ts (kept out of scope; see
	 * the module's own file-scope notes), this module listens for the
	 * resulting `theme:changed` and, if it has a company theme active,
	 * reapplies its own matching variant right after. `_applyingOwnTheme`
	 * distinguishes "we just set this theme ourselves" (nothing to do,
	 * just re-render) from "something else changed the theme" (reassert
	 * ours). Since setTheme() always fires this event again synchronously
	 * when _applyActiveCompanyTheme() below calls it, the reassertion runs
	 * before this call returns, and the outcome does not depend on the
	 * order the two MutationObservers (this module's absence of one, and
	 * demo-loader.ts's) would otherwise run in.
	 */
	private _handleThemeChanged = (): void => {
		if (!this._applyingOwnTheme && this._activeCompany !== null) {
			this._applyActiveCompanyTheme();
			return;
		}
		this._renderPanel();
	};

	private _renderPanel(): void {
		if (!this._root || !this._api) return;
		this._root.render(
			<WhiteLabelPanel
				activeCompanyId={this._activeCompany}
				siteMode={currentSiteMode()}
				theme={this._api.themeManager.getTheme()}
				onSelect={(id) => this._selectCompany(id)}
				onReset={() => this._resetToBrand()}
			/>,
		);
	}

	private _selectCompany(id: CompanyId): void {
		this._activeCompany = id;
		this._api?.storage.local.set(STORAGE_KEY, id);
		this._applyActiveCompanyTheme();

		if (!this._shownRealAppBubble) {
			this._shownRealAppBubble = true;
			this._api?.utils.MessageBubble.show({
				type: 'info',
				message: `This ran on agentlet.io. <a href="${DEMO_SECTION_URL}" style="color: inherit;">See it on a real business app</a>.`,
				allowHtml: true,
				duration: 0,
				closable: true,
			});
		}
	}

	private _resetToBrand(): void {
		this._activeCompany = null;
		this._api?.storage.local.remove(STORAGE_KEY);
		this._applyTheme(AGENTLET_BRAND_THEME[currentSiteMode()]);
	}
}

(window as unknown as Record<string, unknown>).WhiteLabelModule = WhiteLabelModule;
