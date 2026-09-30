import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { ARXIV_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, escapeHtml, squash } from './shared';
import { exportTable, sheetNameFrom, slugify, toTableData } from './table-export';

/**
 * "Papers to spreadsheet" for arXiv.
 *
 * - On a listing (`/list/...`) or a search result page (`/search/...`): finds
 *   every paper (id, title, authors, primary category, abstract and PDF
 *   links), previews them in the panel, and exports the ticked ones to Excel
 *   with the same table helpers as the Wikipedia demo (./table-export.ts).
 * - On an abstract page (`/abs/...`): a small view with the title, authors and
 *   id, and a citation line built only from what the page says.
 *
 * Read only and local. The page is not modified, and nothing is sent anywhere.
 *
 * Markup relied on, as arXiv serves it:
 * - Listing: `dl#articles` holds `dt` (the `a[title="Abstract"]` with the id
 *   text, and the pdf link) followed by a `dd` with `.list-title`,
 *   `.list-authors` and `.primary-subject`.
 * - Search: `li.arxiv-result` with `p.list-title`, `p.title`, `p.authors` and
 *   `.tags .tag` (the first tag is the primary category).
 * - Abstract: `h1.title`, `.authors`, `.primary-subject`, and the
 *   `citation_*` meta tags.
 * Synthetic pages with this markup are the e2e fixtures.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/arxiv-papers`;
const HEADERS = ['ID', 'Title', 'Authors', 'Primary category', 'Abstract link', 'PDF link'];
/** The preview shows at most this many rows; an export always covers every ticked paper. */
const PREVIEW_LIMIT = 200;
const CITATION_AUTHORS = 3;

interface Paper {
	id: string;
	title: string;
	authors: string;
	/** For example "cs.AI". */
	category: string;
	absUrl: string;
	pdfUrl: string;
}

interface AbstractInfo {
	id: string;
	title: string;
	authors: string[];
	category: string;
	year: string;
	absUrl: string;
	pdfUrl: string;
}

function absoluteUrl(href: string | null | undefined): string {
	if (!href) return '';
	try {
		return new URL(href, window.location.href).href;
	} catch {
		return '';
	}
}

function textWithout(element: Element | null, removeSelector: string): string {
	if (!element) return '';
	const copy = element.cloneNode(true) as Element;
	copy.querySelectorAll(removeSelector).forEach((node) => node.remove());
	return squash(copy.textContent ?? '');
}

/** "Artificial Intelligence (cs.AI)" becomes "cs.AI". */
function categoryCode(text: string): string {
	const match = /\(([^()]+)\)\s*$/.exec(text.trim());
	return match ? match[1] : text.trim();
}

function paperFrom(id: string, title: string, authors: string[], category: string, absHref: string | null, pdfHref: string | null): Paper {
	return {
		id,
		title,
		authors: authors.join(', '),
		category,
		absUrl: absoluteUrl(absHref) || `${window.location.origin}/abs/${id}`,
		pdfUrl: absoluteUrl(pdfHref) || `${window.location.origin}/pdf/${id}`,
	};
}

function papersFromListing(): Paper[] {
	const papers: Paper[] = [];
	document.querySelectorAll('dl#articles > dt').forEach((dt) => {
		const abs = dt.querySelector('a[title="Abstract"]');
		const id = squash(abs?.textContent ?? '').replace(/^arXiv:/i, '');
		const dd = dt.nextElementSibling;
		if (!id || !dd || dd.tagName !== 'DD') return;
		const authors = Array.from(dd.querySelectorAll('.list-authors a')).map((a) => squash(a.textContent ?? ''));
		papers.push(
			paperFrom(
				id,
				textWithout(dd.querySelector('.list-title'), '.descriptor'),
				authors,
				categoryCode(squash(dd.querySelector('.primary-subject')?.textContent ?? '')),
				abs?.getAttribute('href') ?? null,
				dt.querySelector('a[title="Download PDF"]')?.getAttribute('href') ?? null,
			),
		);
	});
	return papers;
}

function papersFromSearch(): Paper[] {
	const papers: Paper[] = [];
	document.querySelectorAll('li.arxiv-result').forEach((item) => {
		const abs = item.querySelector('p.list-title a');
		const id = squash(abs?.textContent ?? '').replace(/^arXiv:/i, '');
		if (!id) return;
		const authors = Array.from(item.querySelectorAll('p.authors a')).map((a) => squash(a.textContent ?? ''));
		papers.push(
			paperFrom(
				id,
				squash(item.querySelector('p.title')?.textContent ?? ''),
				authors,
				squash(item.querySelector('.tags .tag')?.textContent ?? ''),
				abs?.getAttribute('href') ?? null,
				item.querySelector('p.list-title a[href*="/pdf/"]')?.getAttribute('href') ?? null,
			),
		);
	});
	return papers;
}

function metaContent(name: string): string {
	return document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content ?? '';
}

function abstractInfo(): AbstractInfo | null {
	const title = textWithout(document.querySelector('h1.title'), '.descriptor');
	if (!title) return null;
	const id = metaContent('citation_arxiv_id') || (/\/abs\/([^?#]+)/.exec(window.location.pathname)?.[1] ?? '');
	const authors = Array.from(document.querySelectorAll('.authors a')).map((a) => squash(a.textContent ?? ''));
	const year = /^\d{4}/.exec(metaContent('citation_date'))?.[0] ?? '';
	return {
		id,
		title,
		authors,
		category: categoryCode(squash(document.querySelector('.primary-subject')?.textContent ?? '')),
		year,
		absUrl: absoluteUrl(`/abs/${id}`),
		pdfUrl: absoluteUrl(metaContent('citation_pdf_url') || `/pdf/${id}`),
	};
}

/** Uses only what the page says: the authors (the first few, then "et al."), the title, the id and the year of the first version. */
function citationLine(info: AbstractInfo): string {
	const names =
		info.authors.length > CITATION_AUTHORS ? `${info.authors.slice(0, CITATION_AUTHORS).join(', ')} et al` : info.authors.join(', ');
	const tail = `arXiv:${info.id}${info.category ? ` [${info.category}]` : ''}${info.year ? `, ${info.year}` : ''}.`;
	return [names ? `${names}.` : '', `${info.title}.`, tail].filter(Boolean).join(' ');
}

function pageSlug(): string {
	const path = window.location.pathname.replace(/^\/(list|search)\//, '$1 ').replace(/\//g, ' ');
	return slugify(`arxiv ${path}`, 'arxiv-papers');
}

const STYLES = `
.ap-table-wrap {
	max-height: 22rem;
	overflow: auto;
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
}

.ap-table {
	border-collapse: collapse;
	width: 100%;
	font-size: 0.8rem;
}

.ap-table th,
.ap-table td {
	border-bottom: 1px solid var(--color-surface-border);
	padding: 4px 6px;
	text-align: left;
	vertical-align: top;
}

.ap-table th {
	position: sticky;
	top: 0;
	background: var(--color-surface);
	color: var(--color-heading);
}

.ap-title {
	color: var(--color-heading);
	font-weight: 600;
}

.ap-authors {
	color: var(--color-text-muted);
	font-size: 0.75rem;
}

.ap-id {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	white-space: nowrap;
}

.ap-citation {
	margin: 0;
	padding: 10px;
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
	background: var(--color-surface);
	font-size: 0.85rem;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
`;

class ArxivPapersModule extends window.agentlet.Module {
	private _papers: Paper[] = [];
	private _unticked = new Set<string>();
	private _abstract: AbstractInfo | null = null;
	private _scanned = false;
	private _container: HTMLElement | null = null;

	constructor() {
		super({
			name: 'arxiv-papers',
			description: 'Finds every paper on an arXiv listing or search page, previews them, and exports the ones you tick to Excel.',
			patterns: [{ type: 'regex', value: ARXIV_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Papers to spreadsheet';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		this._container = container;
		if (!this._scanned) this._scan();
		container.innerHTML = this._render();
		this._wire(container);
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	private _scan(): void {
		this._abstract = /\/abs\//.test(window.location.pathname) ? abstractInfo() : null;
		this._papers = this._abstract ? [] : [...papersFromListing(), ...papersFromSearch()];
		this._unticked = new Set();
		this._scanned = true;
	}

	private _selected(): Paper[] {
		return this._papers.filter((paper) => !this._unticked.has(paper.id));
	}

	private _render(): string {
		if (this._abstract) return this._renderAbstract(this._abstract);
		if (this._papers.length === 0) {
			return `
				<div class="agentlet-panel-body">
					<h3>Papers to spreadsheet</h3>
					<div class="agentlet-empty-state">No papers found on this page. Open a listing such as a category's recent page, or a search result page.</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const shown = this._papers.slice(0, PREVIEW_LIMIT);
		const rows = shown
			.map(
				(paper) => `
					<tr>
						<td><input type="checkbox" data-paper="${escapeHtml(paper.id)}" aria-label="Include ${escapeHtml(paper.id)}" ${this._unticked.has(paper.id) ? '' : 'checked'} /></td>
						<td class="ap-id">${escapeHtml(paper.id)}</td>
						<td><div class="ap-title">${escapeHtml(paper.title)}</div><div class="ap-authors">${escapeHtml(paper.authors)}</div></td>
						<td>${escapeHtml(paper.category)}</td>
					</tr>
				`,
			)
			.join('');
		const more = this._papers.length > shown.length ? `<p class="ks-note">The preview shows the first ${shown.length}. An export covers every ticked paper.</p>` : '';

		return `
			<div class="agentlet-panel-body">
				<h3>Papers to spreadsheet</h3>
				<p class="ks-intro">
					Papers found on this page. Untick the ones you do not want, then export to Excel. The file
					is built in your browser and nothing is sent anywhere.
				</p>
				<ul class="ks-stats">
					<li><strong>${this._papers.length}</strong> papers</li>
					<li><strong data-role="selected-count">${this._selected().length}</strong> ticked</li>
				</ul>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="export">Export to Excel</button>
					<button type="button" class="ks-link-button" data-action="all">Tick all</button>
					<button type="button" class="ks-link-button" data-action="none">Untick all</button>
				</div>
				<div class="ap-table-wrap">
					<table class="ap-table">
						<thead><tr><th></th><th>ID</th><th>Title and authors</th><th>Category</th></tr></thead>
						<tbody>${rows}</tbody>
					</table>
				</div>
				${more}
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderAbstract(info: AbstractInfo): string {
		const citation = citationLine(info);
		return `
			<div class="agentlet-panel-body">
				<h3>Paper details</h3>
				<p class="ks-intro">Everything here comes from this page. Open a listing or a search page to export many papers at once.</p>
				<ul class="ks-stats">
					<li><strong>${escapeHtml(info.id)}</strong></li>
					${info.category ? `<li>${escapeHtml(info.category)}</li>` : ''}
				</ul>
				<p class="ap-title">${escapeHtml(info.title)}</p>
				<p class="ap-authors">${escapeHtml(info.authors.join(', '))}</p>
				<pre class="ap-citation" data-role="citation">${escapeHtml(citation)}</pre>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="copy">Copy citation</button>
				</div>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector('[data-action="export"]')?.addEventListener('click', () => void this._export());
		container.querySelector('[data-action="all"]')?.addEventListener('click', () => this._tickAll(true));
		container.querySelector('[data-action="none"]')?.addEventListener('click', () => this._tickAll(false));
		container.querySelector('[data-action="copy"]')?.addEventListener('click', () => void this._copy());
		container.querySelectorAll<HTMLInputElement>('input[data-paper]').forEach((box) => {
			box.addEventListener('change', () => {
				const id = box.dataset.paper ?? '';
				if (box.checked) this._unticked.delete(id);
				else this._unticked.add(id);
				this._updateCount();
			});
		});
		wireBackToLauncher(container);
	}

	private _updateCount(): void {
		const slot = this._container?.querySelector('[data-role="selected-count"]');
		if (slot) slot.textContent = String(this._selected().length);
	}

	private _tickAll(on: boolean): void {
		this._unticked = on ? new Set() : new Set(this._papers.map((paper) => paper.id));
		this._container?.querySelectorAll<HTMLInputElement>('input[data-paper]').forEach((box) => {
			box.checked = on;
		});
		this._updateCount();
	}

	private async _export(): Promise<void> {
		const chosen = this._selected();
		if (chosen.length === 0) {
			window.agentlet?.utils.MessageBubble.error('Tick at least one paper to export.');
			return;
		}
		const grid = [HEADERS, ...chosen.map((paper) => [paper.id, paper.title, paper.authors, paper.category, paper.absUrl, paper.pdfUrl])];
		const sheetName = sheetNameFrom('Papers', new Set());
		await exportTable(
			{ label: `${chosen.length} paper${chosen.length === 1 ? '' : 's'}`, sheetName, data: toTableData(grid) },
			`${pageSlug()}.xlsx`,
		);
	}

	private async _copy(): Promise<void> {
		if (!this._abstract) return;
		try {
			await navigator.clipboard.writeText(citationLine(this._abstract));
			window.agentlet?.utils.MessageBubble.success('Copied the citation.');
		} catch {
			window.agentlet?.utils.MessageBubble.error('Your browser did not allow copying. Select the text and copy it by hand.');
		}
	}
}

(window as unknown as Record<string, unknown>).ArxivPapersModule = ArxivPapersModule;
