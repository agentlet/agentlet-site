import { AGENTLET_MANIFEST } from './manifest';
import { AGENTLET_BASE_STYLES, backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from './shared';

const DOCS_COMPANION_FILE = 'docs-companion';
const DOCS_COMPANION_TITLE =
	AGENTLET_MANIFEST.find((entry) => entry.id === 'docs-companion')?.title ?? 'Documentation companion';

/**
 * The documentation companion: active on /docs/ and below only, replacing
 * the launcher there (see launcher.ts's own NOT_DOCS_PATTERN, the mirror
 * image of DOCS_PATTERN below). This is the showcase of the core's own URL
 * pattern matching and module switching: ModuleRegistry.checkUrlChange()
 * (agentlet-core src/core/ModuleRegistry.ts) runs findMatchingModule()
 * against every registered module whenever a module registers or the URL
 * changes, and activates whichever one matches. No imperative "if on
 * docs, show this" gate is needed anywhere in this file, in the loader
 * (see the fix in src/scripts/demo-loader.ts's reopen path), or in
 * launcher.ts's own "Try it" handling for this demo: all three lean on
 * Module.checkPattern() instead of special-casing this module's id.
 *
 * Commands (a command palette, opened by a keyboard shortcut or a panel
 * button):
 * - Export the tables of the current page to one .xlsx workbook (one
 *   sheet per table).
 * - Copy every code example on the page to the clipboard.
 * - Follow Starlight's pagination "Next" link.
 *
 * Reading progress (a plain DOM panel, see mount()/unmount() below): pages
 * visited and how far into each the visitor scrolled, saved with
 * window.agentlet.storage.session so it survives the full page reload
 * every docs navigation on this site is (see src/scripts/demo-loader.ts).
 * sessionStorage itself is scoped to the browser tab, so it disappears the
 * same way the rest of the demo session does, without this file needing
 * to listen for core:cleanup itself.
 *
 * Core API gap and workaround: window.agentlet.tables (TablesAPI) can only
 * build and immediately write a single-sheet workbook per call:
 * download()/extractAndDownload() both call the private
 * TableExtractor.createExcelWorkbook() and xlsx.writeFile() in the same
 * step, and neither the raw workbook object nor an "append a sheet" method
 * is exposed publicly. A page with more than one table therefore cannot
 * get "one workbook, one sheet per table" through the public TablesAPI
 * alone. This file works around that by still reading each table's data
 * through the public, documented tables.extract() call, but assembling
 * the combined workbook itself against the window.XLSX (SheetJS) global,
 * using the same three calls TableExtractor.createExcelWorkbook() uses
 * internally (book_new/aoa_to_sheet/book_append_sheet), then the same
 * writeFile() call downloadAsExcel() uses. window.XLSX is not part of
 * agentlet-core's public dist/agentlet-core.d.ts (only window.agentlet and
 * window.agentletConfig are declared there), so this is a deliberate,
 * narrowly scoped exception, made safe because
 * window.agentlet.librarySetup.ensureLibrary('xlsx') (public, documented
 * API) confirms SheetJS is present first. agentlet-core 2.3.0 bundles
 * SheetJS directly into agentlet-core.min.js, so this never triggers a
 * network request. See the build report for the precise gap to file
 * against agentlet-core. When the page has exactly one table,
 * tables.download() is used unmodified instead, no workaround needed.
 */
const DOCS_PATTERN = '\\/docs(?:\\/|$)';

const SHORTCUT_KEYS = 'alt+shift+d';
const SHORTCUT_LABEL = 'Alt+Shift+D (Option+Shift+D on a Mac)';

const PROGRESS_STORAGE_KEY = 'agentlet:docs-companion:progress';
const CTA_SHOWN_KEY = 'agentlet:docs-companion:real-app-cta-shown';

const DOCS_CONTENT_SELECTOR = '.sl-markdown-content';
const SIDEBAR_LINK_SELECTOR = 'nav[aria-label="Main"] a[href]';
const PAGINATION_NEXT_SELECTOR = '.pagination-links a[rel="next"]';

interface ProgressEntry {
	title: string;
	scrollPercent: number;
	visitedAt: string;
}

type ProgressMap = Record<string, ProgressEntry>;

/**
 * Minimal shape of the SheetJS ("xlsx") global agentlet-core bundles into
 * agentlet-core.min.js and exposes on window.XLSX once
 * LibrarySetup.initializeAll() runs (during core.init()); see
 * TableExtractor.ts's own getXLSXGlobal() for the same read against the
 * same runtime object. See the module doc comment above for why this
 * file reads it directly.
 */
interface XLSXGlobal {
	utils: {
		book_new(): unknown;
		aoa_to_sheet(data: unknown[][]): unknown;
		book_append_sheet(workbook: unknown, worksheet: unknown, name: string): void;
	};
	writeFile(workbook: unknown, filename: string): void;
}

function getXLSXGlobal(): XLSXGlobal | undefined {
	return (window as unknown as { XLSX?: XLSXGlobal }).XLSX;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Extra panel styles for this module, layered on top of AGENTLET_BASE_STYLES.
 * Same fallback chain as shared.ts's own styles: the landing page's
 * --color-* custom property first, then the Starlight equivalent
 * --sl-color-* token (see src/styles/starlight-theme.css), then a literal
 * light-mode hex for a page that defines neither.
 */
const DOCS_COMPANION_STYLES = `
.docs-companion-commands h4,
.docs-companion-progress h4 {
	margin: 0 0 4px;
	font-size: 0.95rem;
	font-weight: 600;
	color: var(--color-heading, var(--sl-color-white, #0f3350));
}

.docs-companion-commands ul {
	margin: 0;
	padding-left: 20px;
	color: var(--color-text, var(--sl-color-gray-1, #3d4f5e));
	font-size: 0.9rem;
}

.docs-companion-shortcut {
	margin: 4px 0 0;
	font-size: 0.8rem;
	color: var(--color-text-muted, var(--sl-color-gray-3, #5b6b78));
}

.docs-companion-progress-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.85rem;
}

.docs-companion-progress-list li {
	border: 1px solid var(--color-surface-border, var(--sl-color-gray-5, #d9e0e6));
	border-radius: 8px;
	padding: 8px 10px;
	background: var(--color-surface, var(--sl-color-gray-6, #f4f6f8));
	color: var(--color-text, var(--sl-color-gray-1, #3d4f5e));
}

.docs-companion-progress-list a {
	color: var(--color-heading, var(--sl-color-white, #0f3350));
}

.docs-companion-reset {
	appearance: none;
	align-self: flex-start;
	border: 1.5px solid var(--color-surface-border, var(--sl-color-gray-5, #d9e0e6));
	border-radius: 8px;
	background: transparent;
	color: var(--color-heading, var(--sl-color-white, #0f3350));
	font: inherit;
	font-size: 0.85rem;
	padding: 6px 12px;
	cursor: pointer;
}
`;

class AgentletDocsCompanionModule extends window.agentlet.Module {
	private _container: HTMLElement | null = null;
	private _scrollScheduled = false;

	private _onScroll = (): void => {
		if (this._scrollScheduled) return;
		this._scrollScheduled = true;
		window.requestAnimationFrame(() => {
			this._scrollScheduled = false;
			this._saveScrollProgress();
		});
	};

	constructor() {
		super({
			name: 'docs-companion',
			description: 'Export tables, copy code, and track your reading progress on the docs.',
			patterns: [{ type: 'regex', value: DOCS_PATTERN }],
		});
	}

	async initModule(): Promise<void> {
		const registered = await window.agentlet?.utils.shortcuts?.register(
			SHORTCUT_KEYS,
			() => this._openCommandPalette(),
			{ description: 'Open the docs companion command palette', preventDefault: true },
		);
		if (!registered) {
			this.warn('Could not register the docs companion keyboard shortcut.');
		}
	}

	async cleanupModule(): Promise<void> {
		window.agentlet?.utils.shortcuts?.unregister(SHORTCUT_KEYS);
	}

	async activateModule(): Promise<void> {
		this._recordVisit();
	}

	getPanelTitle(): string {
		return DOCS_COMPANION_TITLE;
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES);
		this.injectStyles(DOCS_COMPANION_STYLES);
		this._container = container;
		container.innerHTML = this._render();
		this._wireActions(container);
		window.addEventListener('scroll', this._onScroll, { passive: true });
	}

	async unmount(): Promise<void> {
		window.removeEventListener('scroll', this._onScroll);
		this._container = null;
	}

	// -- rendering --------------------------------------------------------

	private _render(): string {
		return `
			<div class="agentlet-panel-body">
				<h3>${DOCS_COMPANION_TITLE}</h3>
				<p>Runs on the documentation pages. Hands back to the launcher on the rest of the site.</p>
				<div class="docs-companion-commands">
					<h4>Commands</h4>
					<ul>
						<li>Export the tables of this page to Excel</li>
						<li>Copy all code examples</li>
						<li>Go to the next page</li>
					</ul>
					<button type="button" class="agentlet-try-button" data-action="palette">Open command palette</button>
					<p class="docs-companion-shortcut">Or press ${SHORTCUT_LABEL}.</p>
				</div>
				<div class="docs-companion-progress">
					<h4>Reading progress</h4>
					<div data-role="progress-summary">${this._renderProgressSummary()}</div>
					<div data-role="progress-list">${this._renderProgressList()}</div>
					<button type="button" class="docs-companion-reset" data-action="reset">Reset progress</button>
				</div>
				${sourceLinkHtml(DOCS_COMPANION_FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderProgressSummary(): string {
		const visited = Object.keys(this._readProgress()).length;
		const total = this._getTotalDocsPageCount();
		return total > 0
			? `<p>${visited} of ${total} docs pages visited.</p>`
			: `<p>${visited} docs page${visited === 1 ? '' : 's'} visited.</p>`;
	}

	private _renderProgressList(): string {
		const entries = Object.entries(this._readProgress()).sort((a, b) =>
			a[1].visitedAt.localeCompare(b[1].visitedAt),
		);
		if (entries.length === 0) {
			return '<p class="agentlet-empty-state">No page visited yet.</p>';
		}
		return `<ul class="docs-companion-progress-list">${entries
			.map(
				([path, entry]) =>
					`<li><a href="${escapeHtml(path)}">${escapeHtml(entry.title)}</a>, ${entry.scrollPercent}% read</li>`,
			)
			.join('')}</ul>`;
	}

	private _refreshProgressUI(): void {
		if (!this._container) return;
		const summary = this._container.querySelector<HTMLElement>('[data-role="progress-summary"]');
		const list = this._container.querySelector<HTMLElement>('[data-role="progress-list"]');
		if (summary) summary.innerHTML = this._renderProgressSummary();
		if (list) list.innerHTML = this._renderProgressList();
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelector('[data-action="palette"]')?.addEventListener('click', () => {
			this._openCommandPalette();
		});
		container.querySelector('[data-action="reset"]')?.addEventListener('click', () => {
			this._resetProgress();
		});
		wireBackToLauncher(container);
	}

	// -- progress storage ---------------------------------------------------

	private _currentPath(): string {
		return window.location.pathname;
	}

	private _currentPageTitle(): string {
		const [title] = document.title.split('|');
		return title?.trim() || this._currentPath();
	}

	private _getTotalDocsPageCount(): number {
		return document.querySelectorAll(SIDEBAR_LINK_SELECTOR).length;
	}

	private _readProgress(): ProgressMap {
		return window.agentlet?.storage.session.getJSON<ProgressMap>(PROGRESS_STORAGE_KEY, {}) ?? {};
	}

	private _writeProgress(map: ProgressMap): void {
		window.agentlet?.storage.session.setJSON(PROGRESS_STORAGE_KEY, map);
	}

	private _recordVisit(): void {
		const map = this._readProgress();
		const path = this._currentPath();
		if (!map[path]) {
			map[path] = { title: this._currentPageTitle(), scrollPercent: 0, visitedAt: new Date().toISOString() };
			this._writeProgress(map);
		}
		this._refreshProgressUI();
	}

	private _saveScrollProgress(): void {
		const doc = document.documentElement;
		const scrollable = doc.scrollHeight - doc.clientHeight;
		const percent = scrollable > 0 ? Math.min(100, Math.max(0, Math.round((doc.scrollTop / scrollable) * 100))) : 100;

		const map = this._readProgress();
		const path = this._currentPath();
		const existing = map[path];
		if (!existing || percent <= existing.scrollPercent) return;

		existing.scrollPercent = percent;
		this._writeProgress(map);
		this._refreshProgressUI();
	}

	private _resetProgress(): void {
		window.agentlet?.storage.session.remove(PROGRESS_STORAGE_KEY);
		this._recordVisit();
	}

	// -- command palette ------------------------------------------------

	private _openCommandPalette(): void {
		window.agentlet?.utils.Dialog.showCommandPrompt(
			{
				title: DOCS_COMPANION_TITLE,
				icon: '',
				message: 'Type a command: excel, copy, or next.',
				placeholder: 'excel, copy, or next',
			},
			(value) => {
				if (value == null) return;
				void this._runCommand(value);
			},
		);
	}

	private async _runCommand(raw: string): Promise<void> {
		const input = raw.trim().toLowerCase();
		if (!input) return;

		let ranCommand = false;
		if (input.includes('excel') || input.includes('table')) {
			await this._exportTables();
			ranCommand = true;
		} else if (input.includes('copy') || input.includes('code')) {
			await this._copyCodeExamples();
			ranCommand = true;
		} else if (input.includes('next') || input.includes('page')) {
			ranCommand = this._goToNextPage();
		} else {
			window.agentlet?.utils.MessageBubble.warning(`Unknown command "${raw}". Try "excel", "copy", or "next".`);
		}

		if (ranCommand) this._maybeShowRealAppCta();
	}

	private _maybeShowRealAppCta(): void {
		if (window.agentlet?.storage.session.get(CTA_SHOWN_KEY)) return;
		window.agentlet?.storage.session.set(CTA_SHOWN_KEY, '1');
		window.agentlet?.utils.MessageBubble.show({
			type: 'info',
			message: 'This ran on agentlet.io. See it on <a href="/#demo">a real business app</a>.',
			allowHtml: true,
			duration: 10000,
			closable: true,
		});
	}

	private _xlsxFilename(): string {
		const slug = this._currentPath().replace(/^\/|\/$/g, '').replace(/\//g, '-') || 'docs';
		return `${slug}-tables.xlsx`;
	}

	private async _exportTables(): Promise<void> {
		const tablesApi = window.agentlet?.tables;
		if (!tablesApi) {
			window.agentlet?.utils.MessageBubble.error('The tables API is not available.');
			return;
		}

		const tables = Array.from(document.querySelectorAll<HTMLTableElement>(`${DOCS_CONTENT_SELECTOR} table`));
		if (tables.length === 0) {
			window.agentlet?.utils.MessageBubble.info('This page has no table to export.');
			return;
		}

		const filename = this._xlsxFilename();

		if (tables.length === 1) {
			const data = tablesApi.extract(tables[0]);
			const result = await tablesApi.download(data, { filename, sheetName: 'Table 1' });
			if (result.success) {
				window.agentlet?.utils.MessageBubble.success(`Exported 1 table to ${result.filename}.`);
			} else {
				window.agentlet?.utils.MessageBubble.error(`Could not export the table: ${result.error}`);
			}
			return;
		}

		// See the module doc comment above: TablesAPI has no public way to
		// combine several tables into one multi-sheet workbook, so this
		// assembles it directly against the bundled SheetJS global instead.
		const loaded = await window.agentlet?.librarySetup.ensureLibrary('xlsx');
		const xlsx = getXLSXGlobal();
		if (!loaded || !xlsx) {
			window.agentlet?.utils.MessageBubble.error('Could not load the Excel export library.');
			return;
		}

		const workbook = xlsx.utils.book_new();
		tables.forEach((table, index) => {
			const data = tablesApi.extract(table);
			const rows = data.headers.length ? [data.headers, ...data.rows] : data.rows;
			const sheet = xlsx.utils.aoa_to_sheet(rows);
			xlsx.utils.book_append_sheet(workbook, sheet, `Table ${index + 1}`.slice(0, 31));
		});
		xlsx.writeFile(workbook, filename);
		window.agentlet?.utils.MessageBubble.success(
			`Exported ${tables.length} tables to ${filename}, one sheet per table.`,
		);
	}

	private async _copyCodeExamples(): Promise<void> {
		const codeBlocks = Array.from(
			document.querySelectorAll<HTMLElement>(`${DOCS_CONTENT_SELECTOR} .expressive-code pre code`),
		);
		if (codeBlocks.length === 0) {
			window.agentlet?.utils.MessageBubble.info('This page has no code example to copy.');
			return;
		}

		const combined = codeBlocks
			.map((code, index) => `// Example ${index + 1} of ${codeBlocks.length}\n${this._extractCodeText(code)}`)
			.join('\n\n// ----------\n\n');

		try {
			await navigator.clipboard.writeText(combined);
			window.agentlet?.utils.MessageBubble.success(
				`Copied ${codeBlocks.length} code example${codeBlocks.length === 1 ? '' : 's'} to the clipboard.`,
			);
		} catch {
			window.agentlet?.utils.MessageBubble.error('Could not copy to the clipboard.');
		}
	}

	/**
	 * Expressive Code (the docs' syntax highlighter) renders each source
	 * line as its own div.ec-line, so a plain codeEl.textContent would run
	 * every line together with no separator. Joining each line's own text
	 * with a newline reconstructs the original source faithfully.
	 */
	private _extractCodeText(codeEl: HTMLElement): string {
		const lines = Array.from(codeEl.querySelectorAll<HTMLElement>(':scope > .ec-line'));
		if (lines.length === 0) return codeEl.textContent?.trim() ?? '';
		return lines.map((line) => line.textContent ?? '').join('\n');
	}

	private _goToNextPage(): boolean {
		const nextLink = document.querySelector<HTMLAnchorElement>(PAGINATION_NEXT_SELECTOR);
		if (!nextLink) {
			window.agentlet?.utils.MessageBubble.info('This is the last page of the docs.');
			return false;
		}
		window.location.href = nextLink.href;
		return true;
	}
}

(window as unknown as Record<string, unknown>).AgentletDocsCompanionModule = AgentletDocsCompanionModule;
