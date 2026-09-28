import type { DialogButton, PageHighlighterHighlightControl, TableData } from 'agentlet-core';
import { AGENTLET_BASE_STYLES, backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from './shared';

/**
 * "Compare and export": reads the home page's "Compared to robots" table
 * (src/components/landing/Comparison.astro, `table.comparison-table`),
 * offers three predefined reader profiles, highlights the rows that matter
 * to whichever one is picked, and exports the table with two extra columns
 * marking that relevance. Fully deterministic: no AI call anywhere in this
 * file, so nothing here is labeled "Recorded AI response" (see the panel's
 * own intro text).
 *
 * Home page only, same reasoning as expense-receipt.ts: the table this
 * agentlet reads only exists on `/`. checkPattern() only gates automatic
 * URL-based activation, not a manual "Try it" click from the launcher, so
 * _render() below still defends against that gap with a clear message if
 * the table is missing (e.g. this agentlet launched from a docs page).
 *
 * Core bug worked around here: DialogAPI.choice() (agentlet-core's
 * src/utils/ui/Dialog.ts) always calls
 * `showInfo({ message, title, icon: '📋', buttons }, callback)` internally,
 * with no parameter to override that icon. DialogInfoOptions.icon does
 * support `''` to omit the icon entirely (showInfo's own resolveInfoConfig
 * reads `options.icon === undefined ? 'ℹ️' : (options.icon || '')`), but
 * choice() never forwards a caller-supplied icon to it, so there is no way
 * to get a choice dialog without agentlet-core's hardcoded clipboard emoji.
 * Every dialog on this site must have icon: '' (no emoji in a title), so
 * _openProfileDialog() below calls showInfo() directly instead, building
 * the exact same buttons-from-choices shape choice() builds internally.
 * Reported to the coordinator as a gap in choice()'s public API.
 */
const HOME_PAGE_PATTERN = '^https?:\\/\\/[^/]+\\/?(?:[?#].*)?$';

const FILE = 'compare-export';
const TABLE_SELECTOR = 'table.comparison-table';
const DEMO_SECTION_URL = '/#demo';
const EXPORT_FILENAME = 'compare-and-export.xlsx';
const EXPORT_SHEET_NAME = 'Comparison';

/** Session storage key for the chosen profile: survives a full-page reload (see docs-companion.ts's own PROGRESS_STORAGE_KEY for the same reasoning), which is what lets "the demo reopens through the session flag" (src/scripts/demo-loader.ts) preselect it. */
const PROFILE_STORAGE_KEY = 'agentlet:compare-export:profile';

type ProfileId = 'finance' | 'it' | 'product';

interface ProfileRow {
	/** Must match a row's first cell (the `<th scope="row">` aspect) in table.comparison-table exactly. */
	aspect: string;
	/** One short, honest reason this row matters to this profile, derived from what the row itself says. */
	reason: string;
}

interface Profile {
	id: ProfileId;
	label: string;
	rows: ProfileRow[];
}

/**
 * Static per-profile mapping, derived from src/components/landing/
 * Comparison.astro's own row content: no fact about agentlet here that
 * table does not already state. Kept in this module rather than shared.ts
 * since it is specific to this one demo and this one table.
 */
const PROFILES: Profile[] = [
	{
		id: 'finance',
		label: 'Finance team',
		rows: [
			{
				aspect: 'Security, scope of action',
				reason: 'Every deployment mode stays sandboxed or extension-scoped; only a robot gets full OS access, which matters when the workflow touches financial data.',
			},
			{
				aspect: 'Autonomy',
				reason: 'A bookmarklet or native agentlet needs a user action, and an extension is only semi-autonomous, so nothing acts fully on its own the way a robot does.',
			},
			{
				aspect: 'Relies on user context',
				reason: "Every mode relies on the signed-in user's own context, so it never bypasses the access controls already in place.",
			},
			{
				aspect: 'Performance',
				reason: 'Bookmarklet, extension, and native modes are instant, unlike a robot, which is often slow, useful when a close or a report is time-boxed.',
			},
		],
	},
	{
		id: 'it',
		label: 'Cautious IT department',
		rows: [
			{
				aspect: 'Security, scope of action',
				reason: 'Scope ranges from sandboxed browser-only access to full OS access depending on the mode; IT needs to know exactly which one is deployed.',
			},
			{
				aspect: 'Goes beyond browser',
				reason: 'Only a robot goes system-wide. Every agentlet deployment mode stays inside the browser.',
			},
			{
				aspect: 'Goes beyond current page',
				reason: 'A bookmarklet is limited to the single page it runs on, while an extension can act across browser tabs, which changes what it can reach.',
			},
			{
				aspect: 'Interacts with embedded elements',
				reason: 'Every mode gets deep DOM access, including embedded elements, which is worth reviewing before a rollout.',
			},
			{
				aspect: 'Robustness to UI changes',
				reason: 'Bookmarklet and extension modes are only as robust as their selectors, so a UI change can break them silently.',
			},
		],
	},
	{
		id: 'product',
		label: 'Product team',
		rows: [
			{
				aspect: 'Interacts with page like a user',
				reason: 'Every deployment mode interacts with the page the same way a real user would, which is what makes it useful inside a product flow.',
			},
			{
				aspect: 'Autonomy',
				reason: 'A bookmarklet or native agentlet needs a user action, and an extension is semi-autonomous, so the product keeps control of when it runs.',
			},
			{
				aspect: 'Installation',
				reason: 'A bookmarklet or extension is light to add, while native mode ships served by the host app itself, relevant to the onboarding cost of a new feature.',
			},
			{
				aspect: 'Goes beyond current page',
				reason: 'A bookmarklet only works within a single page, while an extension can act across tabs, which shapes what workflows the product can support.',
			},
		],
	},
];

function findProfile(id: string | null | undefined): Profile | undefined {
	return PROFILES.find((profile) => profile.id === id);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

const STYLES = `
.compare-export-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.compare-export-summary {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 8px;
	font-size: 0.85rem;
}

.compare-export-summary p {
	margin: 0;
}

.compare-export-profile-label {
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.compare-export-row-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.compare-export-row-list li {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 8px;
	padding: 8px 10px;
	background: var(--color-surface, #f4f6f8);
}

.compare-export-row-aspect {
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.compare-export-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.compare-export-link-button {
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
}

.compare-export-actions button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
	text-decoration: none;
}
`;

class CompareExportModule extends window.agentlet.Module {
	private _profileId: ProfileId | null = null;
	private _highlights: PageHighlighterHighlightControl[] = [];
	private _container: HTMLElement | null = null;
	/** Gates the closing MessageBubble to the first successful export only (review round 1 of the other demos showed it should not stack on repeat actions). */
	private _hasExportedOnce = false;

	constructor() {
		super({
			name: 'compare-export',
			description: 'Highlights the comparison rows that matter to a reader profile and exports the table with that relevance marked.',
			patterns: [{ type: 'regex', value: HOME_PAGE_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Compare and export';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);

		// Preselect: if a profile was saved in an earlier activation this
		// session (see PROFILE_STORAGE_KEY), re-apply it immediately instead
		// of asking again. This is what makes the profile survive "the demo
		// reopens through the session flag" (src/scripts/demo-loader.ts),
		// since window.agentlet.storage.session is backed by sessionStorage,
		// which a full-page reload does not clear.
		const stored = window.agentlet?.storage.session.get(PROFILE_STORAGE_KEY);
		if (stored && findProfile(stored) && this._tableElement()) {
			this._applyProfile(stored as ProfileId);
		}
	}

	async unmount(): Promise<void> {
		this._clearHighlights();
		this._container = null;
	}

	async cleanupModule(): Promise<void> {
		this._clearHighlights();
	}

	private _tableElement(): HTMLTableElement | null {
		return document.querySelector<HTMLTableElement>(TABLE_SELECTOR);
	}

	/** Maps each row's first cell text (the aspect) to its `<tr>`, for highlighting and for looking rows up by name. */
	private _rowElementsByAspect(table: HTMLTableElement): Map<string, HTMLTableRowElement> {
		const map = new Map<string, HTMLTableRowElement>();
		table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
			const aspect = row.querySelector('th, td')?.textContent?.trim();
			if (aspect) map.set(aspect, row);
		});
		return map;
	}

	private _clearHighlights(): void {
		this._highlights.forEach((highlight) => highlight.destroy());
		this._highlights = [];
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _render(): string {
		if (!this._tableElement()) {
			return `
				<div class="agentlet-panel-body">
					<h3>Compare and export</h3>
					<p class="compare-export-intro">
						This demo works on agentlet.io's home page, where the "Compared to robots" table lives.
						Go to the home page and open this demo again from there.
					</p>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		return `
			<div class="agentlet-panel-body">
				<h3>Compare and export</h3>
				<p class="compare-export-intro">
					Reads the "Compared to robots" table on this page, highlights the rows that matter to a
					reader profile you pick, and exports the table with that relevance marked. Fully
					deterministic: no AI call is involved, the profile mappings come from a fixed list in
					this file.
				</p>
				${this._renderSummary()}
				${this._renderActions()}
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderSummary(): string {
		const profile = findProfile(this._profileId);
		if (!profile) {
			return '<div class="agentlet-empty-state">No profile chosen yet.</div>';
		}

		const rows = profile.rows
			.map(
				(row) => `
					<li>
						<span class="compare-export-row-aspect">${escapeHtml(row.aspect)}</span>: ${escapeHtml(row.reason)}
					</li>
				`,
			)
			.join('');

		return `
			<div class="compare-export-summary">
				<p>Profile: <span class="compare-export-profile-label">${escapeHtml(profile.label)}</span></p>
				<p>${profile.rows.length} row${profile.rows.length === 1 ? '' : 's'} highlighted on the page:</p>
				<ul class="compare-export-row-list">${rows}</ul>
			</div>
		`;
	}

	private _renderActions(): string {
		const hasProfile = this._profileId !== null;
		const chooseLabel = hasProfile ? 'Change profile' : 'Choose profile';
		const clearDisabled = this._highlights.length === 0;

		if (!hasProfile) {
			return `
				<div class="compare-export-actions">
					<button type="button" class="agentlet-try-button" data-action="choose-profile">${chooseLabel}</button>
				</div>
			`;
		}

		return `
			<div class="compare-export-actions">
				<button type="button" class="agentlet-try-button" data-action="export">Export to Excel</button>
				<button type="button" class="compare-export-link-button" data-action="choose-profile">${chooseLabel}</button>
				<button type="button" class="compare-export-link-button" data-action="clear-highlights" ${clearDisabled ? 'disabled' : ''}>Clear highlights</button>
			</div>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelector('[data-action="choose-profile"]')?.addEventListener('click', () => {
			this._openProfileDialog();
		});
		container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
			void this._exportToExcel();
		});
		container.querySelector('[data-action="clear-highlights"]')?.addEventListener('click', () => {
			this._clearHighlights();
			this._rerender();
		});
		wireBackToLauncher(container);
	}

	/** See the module doc comment: works around DialogAPI.choice() hardcoding a clipboard emoji icon with no override, by calling showInfo() directly with icon: ''. */
	private _openProfileDialog(): void {
		const dialog = window.agentlet?.utils.Dialog;
		if (!dialog) {
			window.agentlet?.utils.MessageBubble.error('The dialog system is not available in this browser.');
			return;
		}

		const current = findProfile(this._profileId);
		const ordered = current ? [current, ...PROFILES.filter((profile) => profile.id !== current.id)] : PROFILES;

		const buttons: DialogButton[] = ordered.map((profile, index) => ({
			text: profile.label,
			value: profile.id,
			primary: index === 0,
		}));
		buttons.push({ text: 'Cancel', value: 'cancel' });

		dialog.showInfo(
			{
				title: 'Choose a reader profile',
				icon: '',
				message: 'Pick who is reading this comparison. The rows that matter for that reader are highlighted on the page.',
				buttons,
			},
			(value) => {
				if (typeof value === 'string' && findProfile(value)) {
					this._applyProfile(value as ProfileId);
				}
			},
		);
	}

	private _applyProfile(id: ProfileId): void {
		const profile = findProfile(id);
		const table = this._tableElement();
		if (!profile || !table) return;

		this._profileId = id;
		window.agentlet?.storage.session.set(PROFILE_STORAGE_KEY, id);

		this._clearHighlights();

		const rowElements = this._rowElementsByAspect(table);
		const highlighter = window.agentlet?.utils.PageHighlighter;
		for (const row of profile.rows) {
			const element = rowElements.get(row.aspect);
			if (!element || !highlighter) continue;
			const control = highlighter.highlight(element, {
				type: 'border',
				style: 'primary',
				animation: 'pulse',
				message: row.reason,
			});
			if (control) this._highlights.push(control);
		}

		if (highlighter) {
			void highlighter.scrollTo(table, { behavior: 'smooth', block: 'center' });
		}

		this._rerender();
	}

	private async _exportToExcel(): Promise<void> {
		const profile = findProfile(this._profileId);
		const table = this._tableElement();
		const tablesApi = window.agentlet?.tables;
		if (!profile || !table || !tablesApi) {
			window.agentlet?.utils.MessageBubble.error('The table export API is not available in this browser.');
			return;
		}

		const extracted = tablesApi.extract(table);
		const relevantReasonByAspect = new Map(profile.rows.map((row) => [row.aspect, row.reason]));
		const relevanceHeader = `Relevant for ${profile.label}`;

		const headers = [...extracted.headers, relevanceHeader, 'Why'];
		const rows = extracted.rows.map((row) => {
			const aspect = row[0];
			const reason = relevantReasonByAspect.get(aspect);
			return [...row, reason ? 'Yes' : 'No', reason ?? ''];
		});

		const tableData: TableData = {
			headers,
			rows,
			metadata: {
				totalRows: rows.length,
				totalColumns: headers.length,
				extractedAt: new Date().toISOString(),
				tableId: table.id || null,
			},
		};

		const result = await tablesApi.download(tableData, { filename: EXPORT_FILENAME, sheetName: EXPORT_SHEET_NAME });
		if (!result.success) {
			window.agentlet?.utils.MessageBubble.error(`Could not export the table: ${result.error}`);
			return;
		}

		window.agentlet?.utils.MessageBubble.success(`Exported the comparison table for ${profile.label}.`);

		if (!this._hasExportedOnce) {
			this._hasExportedOnce = true;
			window.setTimeout(() => {
				window.agentlet?.utils.MessageBubble.show({
					type: 'info',
					message: `This ran on agentlet.io. <a href="${DEMO_SECTION_URL}" style="color: inherit;">See it on a real business app</a>.`,
					allowHtml: true,
					duration: 0,
					closable: true,
				});
			}, 1200);
		}
	}
}

(window as unknown as Record<string, unknown>).CompareExportModule = CompareExportModule;
