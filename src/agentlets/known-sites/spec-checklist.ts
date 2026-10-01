import type { PageHighlighterHighlightControl } from 'agentlet-core';
import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { SPEC_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, escapeHtml, squash } from './shared';
import { readSpec, type Requirement, type SpecDocument } from './spec-extract';
import { exportTable, sheetNameFrom, slugify, toTableData } from './table-export';

/**
 * "Spec to checklist" for normative documents: W3C Technical Reports (with
 * a dedicated reading of WCAG), IETF RFCs on rfc-editor.org, and EUR-Lex
 * legal texts.
 *
 * It extracts each requirement into an audit checklist: id, section, level,
 * the requirement text and a link to its anchor. Each row has a status (to
 * review, compliant, partial, not compliant, not applicable) and a short
 * note. Status and notes are kept in localStorage, per document URL, and
 * never leave the browser. Clicking a row scrolls to the passage and
 * highlights it. The checklist, filtered or not, exports to Excel with the
 * same table helpers as the other demos (./table-export.ts).
 *
 * The page is only read. The extraction rules are in ./spec-extract.ts.
 * The EUR-Lex reading is a heuristic and the panel says it is a reading aid,
 * not legal advice.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/spec-checklist`;
const HEADERS = ['ID', 'Section', 'Title', 'Level', 'Requirement', 'Link', 'Status', 'Notes'];
/** The list shows at most this many rows at once; an export covers every row that matches the filters. */
const LIST_LIMIT = 200;
/** Requirement text longer than this is cut in the panel. The export keeps the whole text. */
const TEXT_LIMIT = 420;
const STORAGE_PREFIX = 'agentlet-spec-checklist:';

type Status = 'review' | 'compliant' | 'partial' | 'non-compliant' | 'na';

const STATUSES: { value: Status; label: string }[] = [
	{ value: 'review', label: 'To review' },
	{ value: 'compliant', label: 'Compliant' },
	{ value: 'partial', label: 'Partial' },
	{ value: 'non-compliant', label: 'Not compliant' },
	{ value: 'na', label: 'Not applicable' },
];

interface Entry {
	status: Status;
	note: string;
}

type Saved = Record<string, Entry>;

function storageKey(): string {
	return STORAGE_PREFIX + window.location.href.replace(/#.*$/, '');
}

function isStatus(value: unknown): value is Status {
	return STATUSES.some((status) => status.value === value);
}

function loadSaved(): { saved: Saved; ok: boolean } {
	try {
		const raw = window.localStorage.getItem(storageKey());
		if (!raw) return { saved: {}, ok: true };
		const parsed: unknown = JSON.parse(raw);
		const saved: Saved = {};
		if (parsed && typeof parsed === 'object') {
			for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
				const entry = value as Partial<Entry> | null;
				if (!entry || typeof entry !== 'object') continue;
				saved[id] = { status: isStatus(entry.status) ? entry.status : 'review', note: typeof entry.note === 'string' ? entry.note : '' };
			}
		}
		return { saved, ok: true };
	} catch {
		return { saved: {}, ok: false };
	}
}

function statusLabel(status: Status): string {
	return STATUSES.find((entry) => entry.value === status)?.label ?? 'To review';
}

/** The absolute address of a requirement on the page, without any hash it already has. */
function linkFor(requirement: Requirement): string {
	const base = window.location.href.replace(/#.*$/, '');
	return requirement.anchor ? `${base}#${encodeURIComponent(requirement.anchor)}` : base;
}

function clip(text: string): string {
	return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT).trimEnd()}...` : text;
}

const STYLES = `
.sc-filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.sc-filters select,
.sc-filters input,
.sc-status,
.sc-note {
	font: inherit;
	font-size: 0.85rem;
	color: var(--color-text);
	background: var(--color-surface);
	border: 1px solid var(--color-surface-border);
	border-radius: 6px;
	padding: 5px 8px;
	min-width: 0;
}

.sc-filters input {
	flex: 1 1 10rem;
}

.sc-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 8px;
	max-height: 26rem;
	overflow: auto;
}

.sc-row {
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
	padding: 8px 10px;
	display: flex;
	flex-direction: column;
	gap: 6px;
	background: var(--color-surface);
}

.sc-row[data-active="true"] {
	border-color: var(--color-accent);
}

.sc-meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 0.78rem;
	color: var(--color-text-muted);
}

.sc-id {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	color: var(--color-heading);
	font-weight: 600;
}

.sc-level {
	border-radius: 999px;
	padding: 0 8px;
	background: var(--color-badge-bg);
	color: var(--color-badge-text);
	font-weight: 600;
}

.sc-title {
	color: var(--color-heading);
	font-weight: 600;
	font-size: 0.85rem;
}

.sc-text {
	appearance: none;
	background: none;
	border: none;
	padding: 0;
	font: inherit;
	font-size: 0.85rem;
	line-height: 1.45;
	text-align: left;
	color: var(--color-text);
	cursor: pointer;
}

.sc-text:hover {
	text-decoration: underline;
	text-decoration-color: var(--color-accent);
}

.sc-controls {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: center;
}

.sc-note {
	flex: 1 1 8rem;
}

.sc-link {
	color: var(--color-heading);
	font-size: 0.78rem;
}
`;

class SpecChecklistModule extends window.agentlet.Module {
	private _doc: SpecDocument | null = null;
	private _scanned = false;
	private _saved: Saved = {};
	private _storageOk = true;
	private _levelFilter = '';
	private _query = '';
	private _activeId = '';
	private _highlight: PageHighlighterHighlightControl | null = null;
	private _container: HTMLElement | null = null;

	constructor() {
		super({
			name: 'spec-checklist',
			description: 'Extracts the requirements of a W3C, IETF or EUR-Lex document into an audit checklist.',
			patterns: [{ type: 'regex', value: SPEC_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Spec to checklist';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		this._container = container;
		// mount() also runs on every URL change, and the document is read once per activation.
		if (!this._scanned) this._scan();
		container.innerHTML = this._render();
		this._wire(container);
		this._renderList();
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	async cleanupModule(): Promise<void> {
		this._clearHighlight();
	}

	private _scan(): void {
		this._doc = readSpec();
		const loaded = loadSaved();
		this._saved = loaded.saved;
		this._storageOk = loaded.ok;
		this._scanned = true;
	}

	private _entry(id: string): Entry {
		return this._saved[id] ?? { status: 'review', note: '' };
	}

	private _persist(): void {
		try {
			// Rows left at their defaults are not stored.
			const compact: Saved = {};
			for (const [id, entry] of Object.entries(this._saved)) {
				if (entry.status !== 'review' || entry.note) compact[id] = entry;
			}
			window.localStorage.setItem(storageKey(), JSON.stringify(compact));
		} catch {
			this._storageOk = false;
			const slot = this._container?.querySelector('[data-role="storage-warning"]');
			if (slot) slot.removeAttribute('hidden');
		}
	}

	private _matching(): Requirement[] {
		if (!this._doc) return [];
		const query = this._query.trim().toLowerCase();
		return this._doc.requirements.filter((row) => {
			if (this._levelFilter && row.level !== this._levelFilter) return false;
			if (!query) return true;
			return [row.id, row.section, row.title, row.text, this._entry(row.id).note].some((field) => field.toLowerCase().includes(query));
		});
	}

	private _render(): string {
		const doc = this._doc;
		if (!doc || doc.requirements.length === 0) {
			return `
				<div class="agentlet-panel-body">
					<h3>Spec to checklist</h3>
					<div class="agentlet-empty-state">No requirements found on this page. Open a W3C Technical Report, an RFC on rfc-editor.org, or a legal text on EUR-Lex.</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const counts = new Map<string, number>();
		for (const row of doc.requirements) counts.set(row.level, (counts.get(row.level) ?? 0) + 1);
		const levelOptions = doc.levels
			.filter((level) => counts.has(level))
			.map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)} (${counts.get(level)})</option>`)
			.join('');
		const reading =
			doc.source === 'eurlex'
				? 'This is a reading aid, not legal advice. It flags article paragraphs that say "shall" or "must" and can miss or over-include text. Read the article itself.'
				: doc.source === 'wcag'
					? 'One row per success criterion, with its level.'
					: 'One row per sentence that holds a requirement keyword (MUST, SHOULD, MAY and their variants).';

		return `
			<div class="agentlet-panel-body">
				<h3>Spec to checklist</h3>
				<p class="ks-intro">
					${escapeHtml(doc.kind)}. Set a status and a note for each requirement, then export the list to Excel.
					Your statuses and notes stay in this browser, for this document only. Nothing is sent anywhere.
				</p>
				<p class="ks-note">${escapeHtml(reading)}</p>
				<p class="ks-note" data-role="storage-warning" ${this._storageOk ? 'hidden' : ''}>Your browser blocked local storage, so statuses and notes will be lost when you close this page.</p>
				<ul class="ks-stats" data-role="stats"></ul>
				<div class="sc-filters">
					<select data-action="level" aria-label="Filter by level">
						<option value="">All levels (${doc.requirements.length})</option>
						${levelOptions}
					</select>
					<input type="search" data-action="query" placeholder="Search requirements" aria-label="Search requirements" />
				</div>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="export">Export to Excel</button>
				</div>
				<ol class="sc-list" data-role="list"></ol>
				<p class="ks-note" data-role="more" hidden></p>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector<HTMLSelectElement>('[data-action="level"]')?.addEventListener('change', (event) => {
			this._levelFilter = (event.target as HTMLSelectElement).value;
			this._renderList();
		});
		container.querySelector<HTMLInputElement>('[data-action="query"]')?.addEventListener('input', (event) => {
			this._query = (event.target as HTMLInputElement).value;
			this._renderList();
		});
		container.querySelector('[data-action="export"]')?.addEventListener('click', () => void this._export());

		const list = container.querySelector('[data-role="list"]');
		list?.addEventListener('click', (event) => {
			const button = (event.target as Element).closest<HTMLElement>('[data-goto]');
			if (button) this._goTo(button.dataset.goto ?? '');
		});
		list?.addEventListener('change', (event) => {
			const select = event.target as HTMLSelectElement;
			if (!select.matches('select[data-status]')) return;
			const id = select.dataset.status ?? '';
			this._saved[id] = { ...this._entry(id), status: select.value as Status };
			this._persist();
			this._renderStats();
		});
		list?.addEventListener('input', (event) => {
			const input = event.target as HTMLInputElement;
			if (!input.matches('input[data-note]')) return;
			const id = input.dataset.note ?? '';
			this._saved[id] = { ...this._entry(id), note: input.value };
			this._persist();
		});
		wireBackToLauncher(container);
	}

	private _renderStats(): void {
		const slot = this._container?.querySelector('[data-role="stats"]');
		const doc = this._doc;
		if (!slot || !doc) return;
		const tally = new Map<Status, number>();
		for (const row of doc.requirements) {
			const status = this._entry(row.id).status;
			tally.set(status, (tally.get(status) ?? 0) + 1);
		}
		const shown = this._matching().length;
		const parts = [`<li><strong data-role="shown-count">${shown}</strong> of ${doc.requirements.length} shown</li>`];
		for (const status of STATUSES) {
			const n = tally.get(status.value) ?? 0;
			if (n > 0 || status.value === 'review') parts.push(`<li><strong>${n}</strong> ${escapeHtml(status.label.toLowerCase())}</li>`);
		}
		slot.innerHTML = parts.join('');
	}

	private _renderList(): void {
		const container = this._container;
		const list = container?.querySelector('[data-role="list"]');
		if (!container || !list) return;
		const matching = this._matching();
		const shown = matching.slice(0, LIST_LIMIT);
		list.innerHTML =
			shown.length === 0
				? '<li class="agentlet-empty-state">No requirement matches these filters.</li>'
				: shown.map((row) => this._rowHtml(row)).join('');
		const more = container.querySelector<HTMLElement>('[data-role="more"]');
		if (more) {
			if (matching.length > shown.length) {
				more.textContent = `The list shows the first ${shown.length} of ${matching.length}. Use the level filter or the search to narrow it. An export covers all ${matching.length}.`;
				more.hidden = false;
			} else {
				more.hidden = true;
			}
		}
		this._renderStats();
	}

	private _rowHtml(row: Requirement): string {
		const entry = this._entry(row.id);
		const options = STATUSES.map(
			(status) => `<option value="${status.value}" ${status.value === entry.status ? 'selected' : ''}>${escapeHtml(status.label)}</option>`,
		).join('');
		const where = [row.section, row.title].filter(Boolean).join(' ');
		return `
			<li class="sc-row" data-row="${escapeHtml(row.id)}" data-active="${row.id === this._activeId}">
				<div class="sc-meta">
					<span class="sc-id">${escapeHtml(row.id)}</span>
					<span class="sc-level">${escapeHtml(row.level)}</span>
					${where ? `<span>${escapeHtml(where)}</span>` : ''}
				</div>
				<button type="button" class="sc-text" data-goto="${escapeHtml(row.id)}" title="Show on page">${escapeHtml(clip(row.text))}</button>
				<div class="sc-controls">
					<select class="sc-status" data-status="${escapeHtml(row.id)}" aria-label="Status of ${escapeHtml(row.id)}">${options}</select>
					<input class="sc-note" type="text" data-note="${escapeHtml(row.id)}" value="${escapeHtml(entry.note)}" placeholder="Note" aria-label="Note for ${escapeHtml(row.id)}" />
					<a class="sc-link" href="${escapeHtml(linkFor(row))}" target="_blank" rel="noopener noreferrer">Open anchor</a>
				</div>
			</li>
		`;
	}

	private _clearHighlight(): void {
		this._highlight?.destroy();
		this._highlight = null;
	}

	private _goTo(id: string): void {
		const row = this._doc?.requirements.find((candidate) => candidate.id === id);
		if (!row) return;
		this._activeId = id;
		this._container?.querySelectorAll<HTMLElement>('.sc-row').forEach((node) => {
			node.dataset.active = String(node.dataset.row === id);
		});
		this._clearHighlight();
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) {
			row.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		this._highlight = highlighter.highlight(row.element, { type: 'border', style: 'primary', animation: 'pulse', message: row.id });
		void highlighter.scrollTo(row.element, { behavior: 'smooth', block: 'center' });
	}

	private async _export(): Promise<void> {
		const rows = this._matching();
		if (rows.length === 0) {
			window.agentlet?.utils.MessageBubble.error('There are no requirements to export. Clear the filters first.');
			return;
		}
		const grid = [
			HEADERS,
			...rows.map((row) => {
				const entry = this._entry(row.id);
				return [row.id, row.section, row.title, row.level, row.text, linkFor(row), statusLabel(entry.status), entry.note];
			}),
		];
		const name = slugify(squash(this._doc?.title ?? ''), 'spec');
		await exportTable(
			{ label: `${rows.length} requirement${rows.length === 1 ? '' : 's'}`, sheetName: sheetNameFrom('Checklist', new Set()), data: toTableData(grid) },
			`${name}-checklist.xlsx`,
		);
	}
}

(window as unknown as Record<string, unknown>).SpecChecklistModule = SpecChecklistModule;
