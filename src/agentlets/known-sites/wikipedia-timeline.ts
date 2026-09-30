import type { PageHighlighterHighlightControl } from 'agentlet-core';
import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { WIKIPEDIA_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, addPageStyle, escapeHtml, squash } from './shared';

/**
 * "Date timeline" for Wikipedia articles: finds dates in the article text,
 * marks them on the page, and lists them in chronological order in the panel.
 * Clicking an entry scrolls to the passage and highlights it with
 * agentlet-core's PageHighlighter.
 *
 * Read only and local. The only change to the page is a `<mark>` element
 * around each date it found, removed again when the agentlet is closed.
 *
 * What counts as a date, and its limits:
 * - Full dates: "20 July 1969", "July 20, 1969", ISO "1969-07-20", and the
 *   same shapes with French, German, Spanish and Italian month names.
 * - Month and year: "July 1969".
 * - Bare years from 1000 to 2099. A bare number is ambiguous ("1500 kg"), so
 *   a year is skipped when it sits inside a longer number or is followed by a
 *   unit or a percent sign. Some counts will still read as years.
 * - Only the article body is read: not tables, the infobox, references,
 *   navigation boxes or headings.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/wikipedia-timeline`;
const MARK_CLASS = 'agentlet-date-mark';
const MARK_ACTIVE_CLASS = 'agentlet-date-mark-active';
const STYLE_ID = 'agentlet-known-sites-date-style';
/** Hard limit on marked dates, to keep very long articles responsive. */
const MAX_ENTRIES = 600;
const SNIPPET_CONTEXT = 60;

/** Containers that hold text which is not the article's own prose. */
const SKIP_SELECTOR = [
	'table',
	'style',
	'script',
	'sup.reference',
	'ol.references',
	'.reflist',
	'.mw-references-wrap',
	'.navbox',
	'.mw-editsection',
	'.toc',
	'#toc',
	'.vector-toc',
	'.catlinks',
	'.infobox',
	'.sidebar',
	'.metadata',
	'.hatnote',
	'cite',
	'.citation',
	'.refbegin',
	'.references',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	`.${MARK_CLASS}`,
].join(', ');

const MONTHS: Record<string, number> = {};
const MONTH_NAMES: string[][] = [
	['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
	['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
	['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'],
	['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
	['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'],
];
for (const names of MONTH_NAMES) {
	names.forEach((name, index) => {
		MONTHS[name] = index + 1;
	});
}
const MONTH_ALTERNATION = Object.keys(MONTHS)
	.sort((a, b) => b.length - a.length)
	.join('|');

/** `\b` does not treat accented letters as word characters, so month names are fenced by explicit lookarounds. */
const NOT_LETTER_BEFORE = '(?<![\\p{L}\\p{N}])';
const NOT_LETTER_AFTER = '(?![\\p{L}\\p{N}])';
const MONTH = `(${MONTH_ALTERNATION})`;

interface DatePattern {
	regex: RegExp;
	precision: 'day' | 'month' | 'year';
	/** Reads year, month and day out of a match. */
	read(match: RegExpExecArray): { year: number; month: number; day: number } | null;
}

/** Words that, right before a number, say it is a year. English, French, German, Spanish and Italian. */
const YEAR_HINTS = [
	'in', 'since', 'from', 'until', 'till', 'by', 'during', 'before', 'after', 'around', 'circa', 'ca', 'c', 'of', 'to',
	'late', 'early', 'mid', 'en', 'depuis', 'vers', 'de', '\u00e0', 'd\u00e8s', 'avant', 'apr\u00e8s', 'ab', 'seit', 'bis',
	'im', 'vor', 'nach', 'desde', 'hasta', 'dal', 'fino', 'nel',
].join('|');

const PATTERNS: DatePattern[] = [
	{
		// 20 July 1969, 20th of July 1969, 1er juillet 1969, 20. Juli 1969, 20 de julio de 1969
		regex: new RegExp(
			`${NOT_LETTER_BEFORE}(\\d{1,2})(?:st|nd|rd|th|er|º)?\\.?\\s+(?:(?:of|de|d')\\s*)?${MONTH}\\s+(?:de\\s+)?(\\d{3,4})${NOT_LETTER_AFTER}`,
			'giu',
		),
		precision: 'day',
		read: (m) => monthDay(Number(m[3]), m[2], Number(m[1])),
	},
	{
		// July 20, 1969
		regex: new RegExp(`${NOT_LETTER_BEFORE}${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{3,4})${NOT_LETTER_AFTER}`, 'giu'),
		precision: 'day',
		read: (m) => monthDay(Number(m[3]), m[1], Number(m[2])),
	},
	{
		// 1969-07-20
		regex: /(?<![\d-])(\d{4})-(\d{2})-(\d{2})(?![\d-])/g,
		precision: 'day',
		read: (m) => {
			const month = Number(m[2]);
			const day = Number(m[3]);
			return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { year: Number(m[1]), month, day } : null;
		},
	},
	{
		// July 1969, juillet 1969
		regex: new RegExp(`${NOT_LETTER_BEFORE}${MONTH}\\s+(?:de\\s+)?(\\d{4})${NOT_LETTER_AFTER}`, 'giu'),
		precision: 'month',
		read: (m) => monthDay(Number(m[2]), m[1], 0),
	},
	{
		// A bare year needs a hint that it is one: a preposition before it
		// ("in 1969", "since 1969"), an opening parenthesis, or the second
		// half of a range ("1950-1969", "1950 and 1969"). Without that, counts
		// and codes ("1201 program alarms") would read as years.
		regex: new RegExp(
			`(?:(?<=\\()|(?<=\\d{4}\\s?[\\u2013\\u2014-]\\s?)|(?<=\\d{4}\\s(?:and|to|et|und|y|e|&)\\s)|(?<=(?<![\\p{L}\\p{N}])(?:${YEAR_HINTS})\\.?\\s{1,3}))` +
				'(1\\d{3}|20\\d{2})' +
				'(?![\\p{L}\\d%]|[,.]\\d|\\s?(?:kg|km|m|mm|cm|mi|ft|lb|lbs|hp|Hz|kHz|MHz|GHz|bytes?|people|men|troops|deaths|votes|tons?|tonnes?|words)(?![\\p{L}]))',
			'giu',
		),
		precision: 'year',
		read: (m) => ({ year: Number(m[1]), month: 0, day: 0 }),
	},
];

function monthDay(year: number, monthName: string, day: number): { year: number; month: number; day: number } | null {
	const month = MONTHS[monthName.toLowerCase()];
	if (!month || day < 0 || day > 31) return null;
	return { year, month, day };
}

interface RawMatch {
	start: number;
	end: number;
	precision: DatePattern['precision'];
	year: number;
	month: number;
	day: number;
}

/** Non-overlapping matches in one text, preferring the earliest start and then the longest match. */
function findDates(text: string): RawMatch[] {
	const all: RawMatch[] = [];
	for (const pattern of PATTERNS) {
		pattern.regex.lastIndex = 0;
		let match = pattern.regex.exec(text);
		while (match) {
			const parts = pattern.read(match);
			if (parts) {
				all.push({ start: match.index, end: match.index + match[0].length, precision: pattern.precision, ...parts });
			}
			if (match[0].length === 0) pattern.regex.lastIndex += 1;
			match = pattern.regex.exec(text);
		}
	}
	all.sort((a, b) => a.start - b.start || b.end - a.end);
	const picked: RawMatch[] = [];
	let lastEnd = -1;
	for (const item of all) {
		if (item.start >= lastEnd) {
			picked.push(item);
			lastEnd = item.end;
		}
	}
	return picked;
}

interface TimelineEntry {
	index: number;
	mark: HTMLElement;
	label: string;
	precision: RawMatch['precision'];
	/** Sort key: year, month, day packed into one number. */
	key: number;
	before: string;
	after: string;
}

function contentRoot(): Element {
	return (
		document.querySelector('#mw-content-text .mw-parser-output') ??
		document.querySelector('#mw-content-text') ??
		document.querySelector('main') ??
		document.body
	);
}

/** Ids of the headings that start the end matter of an article: references, notes, sources, links. Dates there are citations, not the story. */
const END_MATTER_IDS = [
	'References', 'Notes', 'Footnotes', 'Citations', 'Bibliography', 'Sources', 'Further_reading', 'External_links', 'See_also',
	'R\u00e9f\u00e9rences', 'Notes_et_r\u00e9f\u00e9rences', 'Bibliographie', 'Liens_externes', 'Voir_aussi',
	'Einzelnachweise', 'Literatur', 'Weblinks', 'Siehe_auch', 'Anmerkungen',
	'Referencias', 'Notas', 'Bibliograf\u00eda', 'Enlaces_externos', 'V\u00e9ase_tambi\u00e9n',
	'Note', 'Bibliografia', 'Collegamenti_esterni', 'Voci_correlate',
];

/** The first end-matter heading of the article, if any. Text after it is not scanned. */
function endMatterHeading(root: Element): Element | null {
	for (const heading of Array.from(root.querySelectorAll('h2'))) {
		if (END_MATTER_IDS.includes(heading.id)) return heading;
	}
	return null;
}

function collectTextNodes(root: Element): Text[] {
	const stop = endMatterHeading(root);
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (!parent || !node.nodeValue || !/\d/.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
			if (stop && stop.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) return NodeFilter.FILTER_REJECT;
			return parent.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
		},
	});
	let current = walker.nextNode();
	while (current) {
		nodes.push(current as Text);
		current = walker.nextNode();
	}
	return nodes;
}

function cleanRefs(text: string): string {
	return text.replace(/\[(?:\d+|[a-z]|citation needed|note \d+)\]/gi, '');
}

function nearestBlock(node: Node): Element {
	return node.parentElement?.closest('p, li, dd, blockquote, figcaption, div') ?? contentRoot();
}

/** Wraps each date in a `<mark>`, from the end of the node backwards so earlier offsets stay valid. */
function markNode(node: Text, matches: RawMatch[], entries: TimelineEntry[]): void {
	for (let i = matches.length - 1; i >= 0; i -= 1) {
		const item = matches[i];
		const range = document.createRange();
		range.setStart(node, item.start);
		range.setEnd(node, item.end);

		// Read the text around the date before wrapping it: a live Range
		// would shift as the wrapper is inserted.
		const block = nearestBlock(node);
		const before = document.createRange();
		before.setStart(block, 0);
		before.setEnd(node, item.start);
		const after = document.createRange();
		after.setStart(node, item.end);
		after.setEnd(block, block.childNodes.length);
		// Only the outer ends are trimmed, so the spacing next to the date is kept.
		const beforeText = cleanRefs(before.toString()).replace(/\s+/g, ' ').slice(-SNIPPET_CONTEXT).trimStart();
		const afterText = cleanRefs(after.toString()).replace(/\s+/g, ' ').slice(0, SNIPPET_CONTEXT).trimEnd();

		const mark = document.createElement('mark');
		mark.className = MARK_CLASS;
		range.surroundContents(mark);

		entries.push({
			index: 0,
			mark,
			label: squash(mark.textContent ?? ''),
			precision: item.precision,
			key: item.year * 10000 + item.month * 100 + item.day,
			before: beforeText,
			after: afterText,
		});
	}
}

const PAGE_STYLES = `
.${MARK_CLASS} {
	background: rgba(244, 162, 97, 0.35);
	color: inherit;
	border-radius: 2px;
	padding: 0 1px;
}

.${MARK_CLASS}.${MARK_ACTIVE_CLASS} {
	background: rgba(244, 162, 97, 0.85);
	outline: 2px solid #f4a261;
}
`;

const STYLES = `
.dt-filter {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 0.85rem;
}

.dt-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.dt-entry {
	appearance: none;
	width: 100%;
	text-align: left;
	font: inherit;
	color: var(--color-text);
	background: var(--color-surface);
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
	padding: 8px 10px;
	cursor: pointer;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.dt-entry:hover,
.dt-entry:focus-visible {
	border-color: var(--color-accent);
}

.dt-entry-date {
	font-weight: 600;
	color: var(--color-heading);
}

.dt-entry-snippet {
	font-size: 0.82rem;
	color: var(--color-text-muted);
	overflow-wrap: anywhere;
}

.dt-entry-snippet strong {
	color: var(--color-text);
}
`;

class WikipediaTimelineModule extends window.agentlet.Module {
	private _entries: TimelineEntry[] = [];
	private _scanned = false;
	private _truncated = false;
	private _fullDatesOnly = false;
	private _highlight: PageHighlighterHighlightControl | null = null;
	private _removePageStyle: (() => void) | null = null;

	constructor() {
		super({
			name: 'wikipedia-timeline',
			description: 'Finds the dates in the article text and builds a chronological timeline that scrolls to each passage.',
			patterns: [{ type: 'regex', value: WIKIPEDIA_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Date timeline';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		// The page is scanned once per activation: mount() also runs on
		// every URL change (a citation link changes the hash), and marking the
		// text a second time would double-wrap it.
		if (!this._scanned) this._scan();
		this._renderInto(container);
	}

	async cleanupModule(): Promise<void> {
		this._clearHighlight();
		this._unmarkAll();
		this._removePageStyle?.();
		this._removePageStyle = null;
	}

	private _scan(): void {
		this._removePageStyle = addPageStyle(STYLE_ID, PAGE_STYLES);
		const entries: TimelineEntry[] = [];
		for (const node of collectTextNodes(contentRoot())) {
			if (!node.nodeValue) continue;
			const room = MAX_ENTRIES - entries.length;
			if (room <= 0) {
				this._truncated = true;
				break;
			}
			let matches = findDates(node.nodeValue);
			if (matches.length > room) {
				matches = matches.slice(0, room);
				this._truncated = true;
			}
			if (matches.length > 0) markNode(node, matches, entries);
		}

		// markNode() pushes the entries of one text node from its end
		// backwards. Number them in page order first, then sort into
		// chronological order, keeping page order for equal dates.
		entries
			.slice()
			.sort((a, b) => (a.mark.compareDocumentPosition(b.mark) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
			.forEach((entry, index) => {
				entry.index = index;
			});
		this._entries = entries.sort((a, b) => a.key - b.key || a.index - b.index);
		this._scanned = true;
	}

	private _unmarkAll(): void {
		for (const entry of this._entries) {
			const parent = entry.mark.parentNode;
			if (!parent) continue;
			while (entry.mark.firstChild) parent.insertBefore(entry.mark.firstChild, entry.mark);
			parent.removeChild(entry.mark);
			parent.normalize();
		}
		this._entries = [];
		this._scanned = false;
		this._truncated = false;
	}

	private _clearHighlight(): void {
		this._highlight?.destroy();
		this._highlight = null;
		document.querySelectorAll(`.${MARK_ACTIVE_CLASS}`).forEach((node) => node.classList.remove(MARK_ACTIVE_CLASS));
	}

	private _visibleEntries(): TimelineEntry[] {
		return this._fullDatesOnly ? this._entries.filter((entry) => entry.precision === 'day') : this._entries;
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _render(): string {
		if (this._entries.length === 0) {
			return `
				<div class="agentlet-panel-body">
					<h3>Date timeline</h3>
					<div class="agentlet-empty-state">No dates found in the text of this article.</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const visible = this._visibleEntries();
		const fullDates = this._entries.filter((entry) => entry.precision === 'day').length;
		const items = visible
			.map((entry) => {
				const position = this._entries.indexOf(entry);
				return `
					<li>
						<button type="button" class="dt-entry" data-entry="${position}" data-key="${entry.key}">
							<span class="dt-entry-date">${escapeHtml(entry.label)}</span>
							<span class="dt-entry-snippet">${escapeHtml(entry.before)}<strong>${escapeHtml(entry.label)}</strong>${escapeHtml(entry.after)}</span>
						</button>
					</li>
				`;
			})
			.join('');

		return `
			<div class="agentlet-panel-body">
				<h3>Date timeline</h3>
				<p class="ks-intro">
					Dates found in the article text, marked on the page and sorted by time. Click one to jump
					to its passage.
				</p>
				<ul class="ks-stats">
					<li><strong>${this._entries.length}</strong> dates</li>
					<li><strong>${fullDates}</strong> full dates</li>
				</ul>
				${this._truncated ? `<p class="ks-note">Long article: only the first ${MAX_ENTRIES} dates are marked.</p>` : ''}
				<label class="dt-filter">
					<input type="checkbox" data-action="full-only" ${this._fullDatesOnly ? 'checked' : ''} />
					Full dates only (hide bare years and month and year)
				</label>
				<ol class="dt-list">${items || '<li class="ks-note">No full dates in this article.</li>'}</ol>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector<HTMLInputElement>('[data-action="full-only"]')?.addEventListener('change', (event) => {
			this._fullDatesOnly = (event.target as HTMLInputElement).checked;
			this._renderInto(container);
		});
		container.querySelectorAll<HTMLButtonElement>('.dt-entry').forEach((button) => {
			button.addEventListener('click', () => {
				const entry = this._entries[Number(button.dataset.entry)];
				if (entry) this._goTo(entry);
			});
		});
		wireBackToLauncher(container);
	}

	private _goTo(entry: TimelineEntry): void {
		this._clearHighlight();
		entry.mark.classList.add(MARK_ACTIVE_CLASS);
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) {
			entry.mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		this._highlight = highlighter.highlight(entry.mark, {
			type: 'border',
			style: 'primary',
			animation: 'pulse',
			message: entry.label,
		});
		void highlighter.scrollTo(entry.mark, { behavior: 'smooth', block: 'center' });
	}
}

(window as unknown as Record<string, unknown>).WikipediaTimelineModule = WikipediaTimelineModule;
