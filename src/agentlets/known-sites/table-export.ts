import type { TableData } from 'agentlet-core';

/**
 * Turning rows of text into Excel files with agentlet-core's table API, shared
 * by the known-site demos that export tables (wikipedia-tables.ts,
 * arxiv-papers.ts).
 */

/** Sheet names in Excel: at most 31 characters, none of `\ / ? * [ ] :`. */
const MAX_SHEET_NAME = 31;

/** One table ready to export: a label for the panel, a unique sheet name, and the extracted data. */
export interface ExportableTable {
	label: string;
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

/** Lowercase, letters and digits separated by single dashes: safe in a file name. */
export function slugify(text: string, fallback: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || fallback;
}

/** A valid Excel sheet name built from `label`, unique among the names already in `used`. */
export function sheetNameFrom(label: string, used: Set<string>): string {
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

/**
 * Builds a detached `<table>` from a grid (first row is the header) so the
 * core's own extractor reads it, and returns what `tables.extract()` gives.
 */
export function toTableData(grid: string[][]): TableData {
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

/** One table, one sheet, through the core's `tables.download()`. Reports success or failure in a bubble. */
export async function exportTable(table: ExportableTable, filename: string): Promise<void> {
	const api = window.agentlet?.tables;
	if (!api) {
		window.agentlet?.utils.MessageBubble.error('The table export API is not available in this browser.');
		return;
	}
	const result = await api.download(table.data, { filename, sheetName: table.sheetName });
	if (!result.success) {
		window.agentlet?.utils.MessageBubble.error(`Could not export the table: ${result.error}`);
		return;
	}
	window.agentlet?.utils.MessageBubble.success(`Exported ${table.label}.`);
}

/**
 * One workbook, one sheet per table. agentlet-core's download() writes a
 * single sheet per file, so this uses the SheetJS copy the core bundles and
 * exposes as `window.XLSX` for the multi-sheet case, and falls back to one
 * download per table (named by `fallbackName`) if that global is missing.
 */
export async function exportWorkbook(
	tables: ExportableTable[],
	filename: string,
	fallbackName: (table: ExportableTable) => string,
): Promise<void> {
	if (tables.length === 1) {
		await exportTable(tables[0], filename);
		return;
	}

	const xlsx = (globalThis as unknown as { XLSX?: SheetJs }).XLSX;
	if (xlsx?.utils && typeof xlsx.writeFile === 'function') {
		const workbook = xlsx.utils.book_new();
		for (const table of tables) {
			const sheet = xlsx.utils.aoa_to_sheet([table.data.headers, ...table.data.rows]);
			xlsx.utils.book_append_sheet(workbook, sheet, table.sheetName);
		}
		xlsx.writeFile(workbook, filename);
		window.agentlet?.utils.MessageBubble.success(`Exported ${tables.length} tables to one Excel file.`);
		return;
	}

	for (const table of tables) await exportTable(table, fallbackName(table));
}
