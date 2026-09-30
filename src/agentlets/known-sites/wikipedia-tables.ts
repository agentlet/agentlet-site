import type { PageHighlighterHighlightControl, TableData } from 'agentlet-core';
import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { WIKIPEDIA_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, escapeHtml, squash } from './shared';

/**
 * "Tables to spreadsheet" for Wikipedia articles: finds the infobox and every
 * `table.wikitable`, previews them in the panel, and exports them to Excel
 * with agentlet-core's table API (`window.agentlet.tables`).
 *
 * Read only and local. The page is never modified except for a temporary
 * highlight border around a table when its "Show on page" button is used.
 * The workbook is built in the browser; nothing is sent anywhere.
 *
 * Wikipedia tables need some care before the core's generic extractor sees
 * them: cells carry citation markers and hidden sort keys, and rows use
 * `rowspan` and `colspan`, which a cell-by-cell read would misalign. Each table
 * is first turned into a clean rectangular grid (see gridFromTable()), then
 * handed to `tables.extract()` as a plain table so the core does the actual
 * extraction and the download.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/wikipedia-tables`;

/** Wikipedia's own markup that is not table content. Removed from a copy of each cell. */
const NOISE_SELECTOR = [
	'sup.reference',
	'.mw-editsection',
	'style',
	'script',
	'.sortkey',
	'.mw-empty-elt',
	'[style*="display:none"]',
	'[style*="display: none"]',
].join(', ');

/** Sheet names in Excel: at most 31 characters, none of `\ / ? * [ ] :`. */
const MAX_SHEET_NAME = 31;
const PREVIEW_ROWS = 3;
const MAX_COLSPAN = 100;
const MAX_ROWSPAN = 1000;

interface FoundTable {
	kind: 'infobox' | 'wikitable';
	element: HTMLTableElement;
	/** Shown in the panel. */
	label: string;
	/** Excel sheet name, unique within the article. */
	sheetName: string;
	data: TableData;
}

/** The slice of SheetJS (the copy agentlet-core bundles and exposes as `window.XLSX`) used to build one workbook with several sheets. */
interface SheetJs {
	utils: {
		book_new(): unknown;
		aoa_to_sheet(rows: string[][]): unknown;
		book_append_sheet(workbook: unknown, sheet: unknown, name: string): void;
	};
	writeFile(workbook: unknown, filename: string): void;
}

function cleanCellText(cell: Element): string {
	const copy = cell.cloneNode(true) as Element;
	copy.querySelectorAll(NOISE_SELECTOR).forEach((node) => node.remove());
	copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
	copy.querySelectorAll('li, p, div').forEach((block) => block.append('\n'));
	return (copy.textContent ?? '')
		.split('\n')
		.map(squash)
		.filter(Boolean)
		.join('; ');
}

/**
 * Turns a table into a rectangular grid of clean text. A cell with a
 * `rowspan` repeats its value in every row it covers, so each row stands on
 * its own once in a spreadsheet. A cell with a `colspan` keeps its text in the
 * first column only, which keeps title rows readable.
 */
function gridFromTable(table: HTMLTableElement): string[][] {
	const grid: string[][] = [];
	const pending: Array<{ left: number; text: string } | undefined> = [];

	for (const row of Array.from(table.rows)) {
		const out: string[] = [];
		let col = 0;

		const takePending = (): void => {
			let carried = pending[col];
			while (carried && carried.left > 0) {
				out[col] = carried.text;
				carried.left -= 1;
				col += 1;
				carried = pending[col];
			}
		};

		for (const cell of Array.from(row.cells)) {
			takePending();
			const text = cleanCellText(cell);
			const colspan = Math.min(Math.max(cell.colSpan || 1, 1), MAX_COLSPAN);
			const rowspan = Math.min(Math.max(cell.rowSpan || 1, 1), MAX_ROWSPAN);
			for (let i = 0; i < colspan; i += 1) {
				out[col] = i === 0 ? text : '';
				if (rowspan > 1) pending[col] = { left: rowspan - 1, text: i === 0 ? text : '' };
				col += 1;
			}
		}

		takePending();
		for (let c = col; c < pending.length; c += 1) {
			const carried = pending[c];
			if (carried && carried.left > 0) {
				out[c] = carried.text;
				carried.left -= 1;
			}
		}

		const filled = Array.from(out, (value) => value ?? '');
		if (filled.some((value) => value !== '')) grid.push(filled);
	}

	const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
	return grid.map((row) => [...row, ...new Array<string>(width - row.length).fill('')]);
}

/** An infobox is a list of label and value pairs with section title rows, not a grid. */
function infoboxGrid(table: HTMLTableElement): string[][] {
	const rows: string[][] = [['Field', 'Value']];
	for (const row of Array.from(table.rows)) {
		const header = row.querySelector(':scope > th');
		const value = row.querySelector(':scope > td');
		const headerText = header ? cleanCellText(header) : '';
		const valueText = value ? cleanCellText(value) : '';
		if (!headerText && !valueText) continue;
		rows.push([headerText, valueText]);
	}
	return rows;
}

/** Builds a detached `<table>` from a grid so the core's own extractor reads it. */
function toTableData(grid: string[][]): TableData {
	const table = document.createElement('table');
	const [head, ...body] = grid;
	const thead = table.createTHead().insertRow();
	for (const text of head ?? []) {
		const th = document.createElement('th');
		th.textContent = text;
		thead.appendChild(th);
	}
	const tbody = table.createTBody();
	for (const values of body) {
		const tr = tbody.insertRow();
		for (const text of values) tr.insertCell().textContent = text;
	}

	const api = window.agentlet?.tables;
	if (api) return api.extract(table);
	return {
		headers: head ?? [],
		rows: body,
		metadata: {
			totalRows: body.length,
			totalColumns: head?.length ?? 0,
			extractedAt: new Date().toISOString(),
			tableId: null,
		},
	};
}

function sheetNameFrom(label: string, used: Set<string>): string {
	const base = label.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SHEET_NAME) || 'Table';
	let name = base;
	let n = 2;
	while (used.has(name.toLowerCase())) {
		const suffix = ` ${n}`;
		name = base.slice(0, MAX_SHEET_NAME - suffix.length) + suffix;
		n += 1;
	}
	used.add(name.toLowerCase());
	return name;
}

function articleSlug(): string {
	const raw = window.location.pathname.split('/wiki/')[1] ?? 'article';
	let title = raw;
	try {
		title = decodeURIComponent(raw);
	} catch {
		// A malformed escape in the path: use the raw text.
	}
	return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'article';
}

function headingText(heading: Element): string {
	const copy = heading.cloneNode(true) as Element;
	copy.querySelectorAll('.mw-editsection, sup').forEach((node) => node.remove());
	return squash(copy.textContent ?? '');
}

function isNested(table: Element, selector: string): boolean {
	return Boolean(table.parentElement?.closest(selector));
}

function scanTables(): FoundTable[] {
	const found: FoundTable[] = [];
	const used = new Set<string>();
	const headings = Array.from(document.querySelectorAll('h2, h3, h4'));
	const perHeading = new Map<string, number>();

	document.querySelectorAll<HTMLTableElement>('table.infobox').forEach((element) => {
		if (isNested(element, 'table.infobox')) return;
		const grid = infoboxGrid(element);
		if (grid.length < 2) return;
		const caption = element.caption ? squash(cleanCellText(element.caption)) : '';
		const label = caption ? `Infobox: ${caption}` : 'Infobox';
		found.push({
			kind: 'infobox',
			element,
			label,
			sheetName: sheetNameFrom(found.some((t) => t.kind === 'infobox') ? label : 'Infobox', used),
			data: toTableData(grid),
		});
	});

	let index = 0;
	document.querySelectorAll<HTMLTableElement>('table.wikitable').forEach((element) => {
		if (isNested(element, 'table.wikitable')) return;
		const grid = gridFromTable(element);
		if (grid.length === 0) return;
		index += 1;

		const caption = element.caption ? squash(cleanCellText(element.caption)) : '';
		let heading = '';
		for (const candidate of headings) {
			if (candidate.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING) {
				heading = headingText(candidate);
			} else {
				break;
			}
		}
		const title = caption || heading;
		let label = title ? `Table ${index}: ${title}` : `Table ${index}`;
		if (!caption && heading) {
			const seen = (perHeading.get(heading) ?? 0) + 1;
			perHeading.set(heading, seen);
			if (seen > 1) label = `Table ${index}: ${heading} (${seen})`;
		}

		found.push({
			kind: 'wikitable',
			element,
			label,
			sheetName: sheetNameFrom(title || `Table ${index}`, used),
			data: toTableData(grid),
		});
	});

	return found;
}

const STYLES = `
.wt-card {
	border: 1px solid var(--color-surface-border);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.wt-card-title {
	font-weight: 600;
	color: var(--color-heading);
	overflow-wrap: anywhere;
}

.wt-card-size {
	font-size: 0.8rem;
	color: var(--color-text-muted);
}

.wt-preview {
	overflow-x: auto;
	border: 1px solid var(--color-surface-border);
	border-radius: 6px;
	background: var(--color-surface);
}

.wt-preview table {
	border-collapse: collapse;
	font-size: 0.78rem;
	width: 100%;
}

.wt-preview th,
.wt-preview td {
	border-bottom: 1px solid var(--color-surface-border);
	padding: 3px 6px;
	text-align: left;
	vertical-align: top;
	max-width: 14rem;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.wt-preview th {
	color: var(--color-heading);
	font-weight: 600;
}

.wt-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
}
`;

class WikipediaTablesModule extends window.agentlet.Module {
	private _tables: FoundTable[] = [];
	private _highlight: PageHighlighterHighlightControl | null = null;

	constructor() {
		super({
			name: 'wikipedia-tables',
			description: 'Finds the infobox and every table of the article, previews them, and exports them to Excel.',
			patterns: [{ type: 'regex', value: WIKIPEDIA_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Tables to spreadsheet';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		this._tables = scanTables();
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._clearHighlight();
	}

	async cleanupModule(): Promise<void> {
		this._clearHighlight();
	}

	private _clearHighlight(): void {
		this._highlight?.destroy();
		this._highlight = null;
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _render(): string {
		const count = this._tables.length;
		const wikitables = this._tables.filter((table) => table.kind === 'wikitable').length;
		const hasInfobox = this._tables.some((table) => table.kind === 'infobox');

		if (count === 0) {
			return `
				<div class="agentlet-panel-body">
					<h3>Tables to spreadsheet</h3>
					<div class="agentlet-empty-state">This article has no infobox and no data table.</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const summary = `${hasInfobox ? 'the infobox and ' : ''}${wikitables} data table${wikitables === 1 ? '' : 's'}`;
		return `
			<div class="agentlet-panel-body">
				<h3>Tables to spreadsheet</h3>
				<p class="ks-intro">
					Found ${summary} on this page. Preview them here and export to Excel. The file is built in
					your browser and nothing is sent anywhere.
				</p>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="export-all">
						${count === 1 ? 'Export to Excel' : `Export all ${count} to one Excel file`}
					</button>
				</div>
				<ul class="wt-list">${this._tables.map((table, index) => this._renderCard(table, index)).join('')}</ul>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderCard(table: FoundTable, index: number): string {
		const { headers, rows } = table.data;
		const previewRows = rows.slice(0, PREVIEW_ROWS);
		const head = `<tr>${headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr>`;
		const body = previewRows
			.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
			.join('');
		const more = rows.length > previewRows.length ? `, preview of the first ${previewRows.length}` : '';
		return `
			<li class="wt-card" data-table="${index}">
				<span class="wt-card-title">${escapeHtml(table.label)}</span>
				<span class="wt-card-size">${rows.length} row${rows.length === 1 ? '' : 's'}, ${table.data.metadata.totalColumns} column${table.data.metadata.totalColumns === 1 ? '' : 's'}${more}</span>
				<div class="wt-preview"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="export" data-index="${index}">Export</button>
					<button type="button" class="ks-link-button" data-action="show" data-index="${index}">Show on page</button>
				</div>
			</li>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector('[data-action="export-all"]')?.addEventListener('click', () => {
			void this._exportAll();
		});
		container.querySelectorAll<HTMLButtonElement>('[data-action="export"]').forEach((button) => {
			button.addEventListener('click', () => {
				const table = this._tables[Number(button.dataset.index)];
				if (table) void this._exportOne(table);
			});
		});
		container.querySelectorAll<HTMLButtonElement>('[data-action="show"]').forEach((button) => {
			button.addEventListener('click', () => {
				const table = this._tables[Number(button.dataset.index)];
				if (table) this._show(table);
			});
		});
		wireBackToLauncher(container);
	}

	private _show(table: FoundTable): void {
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) {
			table.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		this._clearHighlight();
		this._highlight = highlighter.highlight(table.element, {
			type: 'border',
			style: 'primary',
			animation: 'pulse',
			message: table.label,
		});
		void highlighter.scrollTo(table.element, { behavior: 'smooth', block: 'center' });
	}

	private async _exportOne(table: FoundTable): Promise<void> {
		const api = window.agentlet?.tables;
		if (!api) {
			window.agentlet?.utils.MessageBubble.error('The table export API is not available in this browser.');
			return;
		}
		const slug = table.kind === 'infobox' ? 'infobox' : table.sheetName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
		const result = await api.download(table.data, {
			filename: `${articleSlug()}-${slug || 'table'}.xlsx`,
			sheetName: table.sheetName,
		});
		if (!result.success) {
			window.agentlet?.utils.MessageBubble.error(`Could not export the table: ${result.error}`);
			return;
		}
		window.agentlet?.utils.MessageBubble.success(`Exported ${table.label}.`);
	}

	/**
	 * One workbook, one sheet per table. agentlet-core's download() writes a
	 * single sheet per file, so this uses the SheetJS copy the core bundles
	 * and exposes as `window.XLSX` for the multi-sheet case, and falls back to
	 * one download per table if that global is missing.
	 */
	private async _exportAll(): Promise<void> {
		if (this._tables.length === 1) {
			await this._exportOne(this._tables[0]);
			return;
		}

		const xlsx = (globalThis as unknown as { XLSX?: SheetJs }).XLSX;
		if (xlsx?.utils && typeof xlsx.writeFile === 'function') {
			const workbook = xlsx.utils.book_new();
			for (const table of this._tables) {
				const sheet = xlsx.utils.aoa_to_sheet([table.data.headers, ...table.data.rows]);
				xlsx.utils.book_append_sheet(workbook, sheet, table.sheetName);
			}
			xlsx.writeFile(workbook, `${articleSlug()}-tables.xlsx`);
			window.agentlet?.utils.MessageBubble.success(`Exported ${this._tables.length} tables to one Excel file.`);
			return;
		}

		for (const table of this._tables) await this._exportOne(table);
	}
}

(window as unknown as Record<string, unknown>).WikipediaTablesModule = WikipediaTablesModule;
