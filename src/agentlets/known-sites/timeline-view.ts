import { squash } from './shared';
import { exportTable, slugify, toTableData } from './table-export';

/**
 * The visual timeline view of the "Date timeline" demo
 * (./wikipedia-timeline.ts), shown in agentlet-core's fullscreen dialog.
 *
 * Everything here is derived from the dates the demo already found: no AI,
 * nothing specific to one article, nothing sent anywhere.
 *
 * - Adaptive axis: the domain is the span of the dates found, snapped to a
 *   calendar grid. Ticks and density buckets are both picked from one list of
 *   calendar steps (days, months, years up to a thousand years), the finest
 *   step that still fits the width: about one tick per 60 to 110 px and one
 *   bucket per 14 px or more.
 * - Density strip: one bar per non-empty bucket. A mention counts in the
 *   bucket that holds the middle of its period. Clicking a bar filters the
 *   list below the axis to that bucket.
 * - Points: mentions of the same date collapse into one point with a count.
 *   Colour is the article section of the first mention. A full date is a
 *   filled point; a month and year, or a bare year, is a hollow point with a
 *   line that spans its period when the scale is fine enough to show it.
 * - Keyboard: the points and the bars are each one tab stop (roving
 *   tabindex, arrow keys, Home and End). The list below is plain buttons.
 *
 * The page is never touched from here: choosing a point or a list row closes
 * the dialog and hands the entry back to the demo, which scrolls to it.
 */

export type Precision = 'day' | 'month' | 'year';

/** What the view needs to know about one mention of a date. */
export interface ViewEntry {
	label: string;
	precision: Precision;
	/** Year, month and day packed into one number: 19690720, or 19690700 for a month, 19690000 for a year. */
	key: number;
	before: string;
	after: string;
	/** Name of the article section the mention sits in. */
	section: string;
	/** Position of the mention in the article, 0 first. */
	index: number;
}

export interface TimelineViewOptions<T extends ViewEntry> {
	/** Every mention, in any order. */
	entries: T[];
	/** Article title: shown in the dialog title and used for the file name of the export. */
	title: string;
	/** BCP 47 tag for month names on the axis, normally the page language. */
	locale: string;
	/** Called after the dialog closed because a point or a list row was chosen. */
	onSelect(entry: T): void;
	/** Called after the dialog closed without a choice. */
	onDismiss?(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 86400000;
/** Colours for sections; more sections than this share "Other sections". */
const SECTION_COLOURS = 9;
const OTHER_SLOT = SECTION_COLOURS;
const MARGIN_X = 24;
const STRIP_HEIGHT = 64;
const STRIP_GAP = 14;
const LANE_HEIGHT = 15;
const MAX_LANES = 10;
const AXIS_HEIGHT = 36;
/** Pixels of the list to bring into view when a filter is applied. */
const LIST_PEEK = 150;
const BAR_MIN_WIDTH = 14;
const DOT_RADIUS = 5;
const DOT_RADIUS_GROUP = 7.5;
const PRECISION_NAMES: Record<Precision, string> = { day: 'Full date', month: 'Month and year', year: 'Year only' };
const EXPORT_HEADERS = ['Date', 'Precision', 'Section', 'Sentence'];

/* ---------------------------------------------------------------------- */
/* Time                                                                    */
/* ---------------------------------------------------------------------- */

/** Days since 1970-01-01 (UTC). `month` may run past 12 and `day` past the month's length: the date rolls over. */
function dayNumber(year: number, month: number, day: number): number {
	const date = new Date(0);
	date.setUTCFullYear(year, month - 1, day);
	return Math.floor(date.getTime() / DAY_MS);
}

function civil(days: number): { year: number; month: number; day: number } {
	const date = new Date(days * DAY_MS);
	return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

/** First day (inclusive) and end (exclusive) of the period an entry names. */
function periodOf(entry: ViewEntry): { start: number; end: number } {
	const year = Math.floor(entry.key / 10000);
	const month = Math.floor(entry.key / 100) % 100;
	const day = entry.key % 100;
	if (entry.precision === 'day') {
		const start = dayNumber(year, month, Math.max(day, 1));
		return { start, end: start + 1 };
	}
	if (entry.precision === 'month') return { start: dayNumber(year, month, 1), end: dayNumber(year, month + 1, 1) };
	return { start: dayNumber(year, 1, 1), end: dayNumber(year + 1, 1, 1) };
}

function pad(value: number, width: number): string {
	return String(value).padStart(width, '0');
}

/** Sortable text for the export: 1969-07-20, 1969-07 or 1969. */
function isoOf(entry: ViewEntry): string {
	const year = Math.floor(entry.key / 10000);
	const month = Math.floor(entry.key / 100) % 100;
	const day = entry.key % 100;
	if (entry.precision === 'day') return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
	if (entry.precision === 'month') return `${pad(year, 4)}-${pad(month, 2)}`;
	return pad(year, 4);
}

/* ---------------------------------------------------------------------- */
/* Scale                                                                   */
/* ---------------------------------------------------------------------- */

type Unit = 'day' | 'month' | 'year';

interface Step {
	unit: Unit;
	/** How many units one step spans. */
	n: number;
	/** Approximate length in days, to compare steps. */
	days: number;
}

/** Calendar steps from fine to coarse. Each one is aligned on multiples of `n`, so ticks fall on round values. */
const STEPS: Step[] = [
	...[1, 2, 7, 14].map((n): Step => ({ unit: 'day', n, days: n })),
	...[1, 2, 3, 6].map((n): Step => ({ unit: 'month', n, days: n * 30.44 })),
	...[1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].map((n): Step => ({ unit: 'year', n, days: n * 365.25 })),
];

/** Pixels one tick label needs, with room around it. */
const LABEL_WIDTH: Record<Unit, number> = { day: 112, month: 92, year: 64 };

/** The finest step that gives at most `maxCount` intervals over `spanDays`, where `maxCount` may depend on the step. */
function pickStep(spanDays: number, maxCount: (step: Step) => number): Step {
	return STEPS.find((step) => spanDays / step.days <= maxCount(step)) ?? STEPS[STEPS.length - 1];
}

/** Boundaries of a step grid, the first at or before `lo`, the last at or after `hi`. Weeks start on a Monday. */
function boundaries(step: Step, lo: number, hi: number): number[] {
	const out: number[] = [];
	if (step.unit === 'day') {
		const offset = step.n >= 7 ? 4 : 0; // 1970-01-05 was a Monday
		let day = Math.floor((lo - offset) / step.n) * step.n + offset;
		for (;;) {
			out.push(day);
			if (day >= hi) break;
			day += step.n;
		}
	} else if (step.unit === 'month') {
		const start = civil(lo);
		let month = Math.floor((start.year * 12 + start.month - 1) / step.n) * step.n;
		for (;;) {
			const day = dayNumber(Math.floor(month / 12), (month % 12) + 1, 1);
			out.push(day);
			if (day >= hi) break;
			month += step.n;
		}
	} else {
		let year = Math.floor(civil(lo).year / step.n) * step.n;
		for (;;) {
			const day = dayNumber(year, 1, 1);
			out.push(day);
			if (day >= hi) break;
			year += step.n;
		}
	}
	return out;
}

function plural(count: number, one: string, many: string): string {
	return `${count} ${count === 1 ? one : many}`;
}

/** Index of the last boundary at or before `value`. */
function bucketOf(edges: number[], value: number): number {
	let low = 0;
	let high = edges.length - 2;
	while (low < high) {
		const mid = (low + high + 1) >> 1;
		if (edges[mid] <= value) low = mid;
		else high = mid - 1;
	}
	return low;
}

/** "Mentions per year", "per 5 years", "per month", "per 2 weeks". */
function stepName(step: Step): string {
	if (step.unit === 'day' && step.n === 7) return 'week';
	if (step.unit === 'day' && step.n === 14) return '2 weeks';
	const word = step.unit;
	return step.n === 1 ? word : `${step.n} ${word}s`;
}

/* ---------------------------------------------------------------------- */
/* DOM helpers                                                             */
/* ---------------------------------------------------------------------- */

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

function svg<K extends keyof SVGElementTagNameMap>(
	tag: K,
	attrs: Record<string, string | number> = {},
	className?: string,
): SVGElementTagNameMap[K] {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
	if (className) node.setAttribute('class', className);
	return node;
}

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

/** Moves focus between the items of a group with the arrow keys, Home and End, and keeps exactly one of them in the tab order. */
function wireRoving(group: Element, items: () => Array<HTMLElement | SVGElement>): void {
	const select = (all: Array<HTMLElement | SVGElement>, target: HTMLElement | SVGElement): void => {
		for (const item of all) item.setAttribute('tabindex', item === target ? '0' : '-1');
	};
	group.addEventListener('focusin', (event) => {
		const target = (event.target as Element).closest('[data-roving]');
		if (target) select(items(), target as HTMLElement | SVGElement);
	});
	group.addEventListener('keydown', (event) => {
		const key = (event as KeyboardEvent).key;
		const all = items();
		const current = all.indexOf((event.target as Element).closest('[data-roving]') as HTMLElement | SVGElement);
		if (current === -1 || all.length === 0) return;
		let next = current;
		if (key === 'ArrowRight' || key === 'ArrowDown') next = Math.min(all.length - 1, current + 1);
		else if (key === 'ArrowLeft' || key === 'ArrowUp') next = Math.max(0, current - 1);
		else if (key === 'Home') next = 0;
		else if (key === 'End') next = all.length - 1;
		else return;
		event.preventDefault();
		select(all, all[next]);
		all[next].focus();
	});
}

/* ---------------------------------------------------------------------- */
/* View                                                                    */
/* ---------------------------------------------------------------------- */

interface Mention<T extends ViewEntry> {
	entry: T;
	start: number;
	end: number;
	mid: number;
}

/** One or more mentions of the same date. */
interface Point<T extends ViewEntry> {
	mentions: Mention<T>[];
	first: Mention<T>;
	start: number;
	end: number;
	mid: number;
	slot: number;
	element: SVGGElement | null;
}

interface Bucket {
	start: number;
	end: number;
	count: number;
	element: SVGGElement | null;
}

interface SectionInfo {
	name: string;
	slot: number;
	count: number;
}

class TimelineView<T extends ViewEntry> {
	readonly root = html('div', 'ks-dialog tl-root');
	private readonly _mentions: Mention<T>[];
	private readonly _points: Point<T>[];
	private readonly _sections: SectionInfo[];
	private readonly _slotOfSection = new Map<string, number>();
	private readonly _intl: (options: Intl.DateTimeFormatOptions) => Intl.DateTimeFormat;
	private _selected: T | null = null;
	private _width = 0;
	private _buckets: Bucket[] = [];
	private _bucketStep: Step = STEPS[0];
	private _active: { start: number; end: number } | null = null;
	private _observer: ResizeObserver | null = null;
	private _frame = 0;
	private readonly _host = html('div', 'tl-chart');
	private readonly _caption = html('p', 'tl-caption');
	private readonly _tooltip = html('div', 'tl-tooltip');
	private readonly _status = html('p', 'tl-status');
	private readonly _showAll = html('button', 'tl-button', 'Show all');
	private readonly _list = html('ol', 'tl-list');
	private _svg: SVGSVGElement | null = null;
	private _focusedPoint = -1;

	constructor(private readonly _options: TimelineViewOptions<T>) {
		this._mentions = _options.entries
			.map((entry) => {
				const { start, end } = periodOf(entry);
				return { entry, start, end, mid: (start + end) / 2 };
			})
			.sort((a, b) => a.entry.key - b.entry.key || a.entry.index - b.entry.index);

		const byKey = new Map<string, Mention<T>[]>();
		for (const mention of this._mentions) {
			const id = `${mention.entry.precision}:${mention.entry.key}`;
			const group = byKey.get(id);
			if (group) group.push(mention);
			else byKey.set(id, [mention]);
		}

		this._sections = this._assignSections();
		this._points = Array.from(byKey.values()).map((group) => {
			const first = group.reduce((best, item) => (item.entry.index < best.entry.index ? item : best));
			return {
				mentions: group,
				first,
				start: first.start,
				end: first.end,
				mid: first.mid,
				slot: this._slotOfSection.get(first.entry.section) ?? OTHER_SLOT,
				element: null,
			};
		}).sort((a, b) => a.mid - b.mid || a.first.entry.index - b.first.entry.index);

		this._intl = (options) => {
			try {
				return new Intl.DateTimeFormat(_options.locale || 'en', { ...options, timeZone: 'UTC' });
			} catch {
				return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' });
			}
		};
		this._build();
	}

	/** Called by the dialog code once the root is in the page. */
	start(): void {
		this.root.tabIndex = -1;
		this.root.focus({ preventScroll: true });
		const render = (): void => {
			this._frame = 0;
			const width = Math.max(320, Math.floor(this._host.clientWidth));
			if (width !== this._width) this._renderChart(width);
		};
		if (typeof ResizeObserver === 'function') {
			this._observer = new ResizeObserver(() => {
				if (!this._frame) this._frame = window.requestAnimationFrame(render);
			});
			this._observer.observe(this._host);
		}
		render();
	}

	destroy(): void {
		this._observer?.disconnect();
		this._observer = null;
		if (this._frame) window.cancelAnimationFrame(this._frame);
		this._frame = 0;
	}

	takeSelection(): T | null {
		const selected = this._selected;
		this._selected = null;
		return selected;
	}

	/* ---- sections ---- */

	/** Sections in article order. The nine with the most mentions get a colour; the rest share one. */
	private _assignSections(): SectionInfo[] {
		const found = new Map<string, { first: number; count: number }>();
		for (const { entry } of this._mentions) {
			const item = found.get(entry.section);
			if (item) {
				item.count += 1;
				item.first = Math.min(item.first, entry.index);
			} else {
				found.set(entry.section, { first: entry.index, count: 1 });
			}
		}
		const inPageOrder = Array.from(found, ([name, item]) => ({ name, ...item })).sort((a, b) => a.first - b.first);
		const coloured = new Set(
			inPageOrder
				.slice()
				.sort((a, b) => b.count - a.count || a.first - b.first)
				.slice(0, SECTION_COLOURS)
				.map((item) => item.name),
		);
		let next = 0;
		let otherCount = 0;
		const result: SectionInfo[] = [];
		for (const item of inPageOrder) {
			if (coloured.has(item.name)) {
				this._slotOfSection.set(item.name, next);
				result.push({ name: item.name, slot: next, count: item.count });
				next += 1;
			} else {
				otherCount += item.count;
			}
		}
		if (otherCount > 0) result.push({ name: 'Other sections', slot: OTHER_SLOT, count: otherCount });
		return result;
	}

	private _slotOf(entry: ViewEntry): number {
		return this._slotOfSection.get(entry.section) ?? OTHER_SLOT;
	}

	/* ---- static parts ---- */

	private _build(): void {
		const dates = this._points.length;
		const first = this._mentions[0].entry;
		const last = this._mentions[this._mentions.length - 1].entry;

		const header = html('div', 'tl-header');
		const summary = html(
			'p',
			'tl-summary',
			`${plural(this._mentions.length, 'mention', 'mentions')} of ${plural(dates, 'date', 'dates')}, from ${first.label} to ${last.label}.`,
		);
		const actions = html('div', 'tl-actions');
		const exportButton = html('button', 'tl-button tl-button-primary', 'Export to Excel');
		exportButton.type = 'button';
		exportButton.dataset.action = 'export';
		exportButton.addEventListener('click', () => void this._export());
		this._showAll.type = 'button';
		this._showAll.dataset.action = 'show-all';
		this._showAll.addEventListener('click', () => this._setActive(null));
		actions.append(this._showAll, exportButton);
		header.append(summary, actions);

		const chartHead = html('div', 'tl-chart-head');
		chartHead.append(this._caption, this._buildPrecisionLegend());
		this._host.append(chartHead);
		this._tooltip.setAttribute('role', 'tooltip');
		this._tooltip.hidden = true;
		this._host.append(this._tooltip);

		const listHead = html('div', 'tl-list-head');
		const listTitle = html('h3', 'tl-list-title', 'Mentions');
		this._status.setAttribute('role', 'status');
		listHead.append(listTitle, this._status);
		const listWrap = html('div', 'tl-list-wrap');
		listWrap.append(listHead, this._list);

		this.root.append(header, this._buildLegend(), this._host, listWrap);

		// agentlet-core's dialog cancels every Enter key press at the document
		// (to activate its own primary button), which also stops a focused
		// button from being activated by Enter. Activate on keydown here, before
		// it gets that far. Space is left to the browser on native buttons.
		this.root.addEventListener('keydown', (event) => {
			const key = event.key;
			const target = (event.target as Element).closest('button, [role="button"]');
			if (!target || (key !== 'Enter' && key !== ' ')) return;
			const native = target instanceof HTMLButtonElement;
			if (native && key === ' ') return;
			event.preventDefault();
			target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		});

		this._applyFilter();
	}

	private _buildLegend(): HTMLElement {
		const legend = html('div', 'tl-legend');

		const sections = html('ul', 'tl-legend-list');
		sections.setAttribute('aria-label', 'Article sections');
		for (const section of this._sections) {
			const item = html('li', 'tl-legend-item');
			item.append(html('span', `tl-swatch tl-s${section.slot}`), html('span', undefined, section.name));
			item.append(html('span', 'tl-legend-count', String(section.count)));
			sections.append(item);
		}

		legend.append(sections);
		return legend;
	}

	/** How to read a point: filled or hollow, with a line, with a count. */
	private _buildPrecisionLegend(): HTMLElement {
		const precision = html('ul', 'tl-legend-list tl-legend-precision');
		precision.setAttribute('aria-label', 'Point styles');
		const glyph = (kind: 'filled' | 'hollow' | 'count'): SVGSVGElement => {
			const wide = kind === 'hollow';
			const w = wide ? 38 : 18;
			const icon = svg('svg', { width: w, height: 18, viewBox: `0 0 ${w} 18`, 'aria-hidden': 'true' }, 'tl-glyph tl-s0');
			if (kind === 'filled') {
				icon.append(svg('circle', { cx: 9, cy: 9, r: DOT_RADIUS }, 'tl-dot'));
			} else if (kind === 'hollow') {
				icon.append(svg('line', { x1: 3, y1: 9, x2: 35, y2: 9 }, 'tl-span'));
				icon.append(svg('circle', { cx: 19, cy: 9, r: DOT_RADIUS - 1 }, 'tl-ring'));
			} else {
				icon.append(svg('circle', { cx: 9, cy: 9, r: DOT_RADIUS_GROUP }, 'tl-dot'));
				const text = svg('text', { x: 9, y: 12.5, 'text-anchor': 'middle' }, 'tl-dot-count');
				text.textContent = '3';
				icon.append(text);
			}
			return icon;
		};
		for (const [kind, text] of [
			['filled', 'Full date'],
			['hollow', 'Month and year, or year only (the line shows the period)'],
			['count', 'Count of mentions of the same date'],
		] as const) {
			const item = html('li', 'tl-legend-item');
			item.append(glyph(kind), html('span', undefined, text));
			precision.append(item);
		}
		return precision;
	}

	/* ---- chart ---- */

	private _renderChart(width: number): void {
		this._width = width;
		this._hideTooltip();
		const innerWidth = Math.max(200, width - 2 * MARGIN_X);

		// Domain: the span of the periods found, at least a week, snapped to
		// the bucket grid so that no bar is cut and no space is wasted.
		let lo = Math.min(...this._mentions.map((m) => m.start));
		let hi = Math.max(...this._mentions.map((m) => m.end));
		if (hi - lo < 7) {
			const centre = (lo + hi) / 2;
			lo = Math.floor(centre - 3.5);
			hi = lo + 7;
		}
		const maxBuckets = Math.max(4, Math.floor(innerWidth / BAR_MIN_WIDTH));
		const bucketStep = pickStep(hi - lo, () => maxBuckets);
		const edges = boundaries(bucketStep, lo, hi);
		lo = edges[0];
		hi = edges[edges.length - 1];
		this._bucketStep = bucketStep;

		const span = hi - lo;
		const x = (day: number): number => MARGIN_X + ((day - lo) / span) * innerWidth;

		// Buckets and their counts.
		this._buckets = edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1], count: 0, element: null }));
		for (const mention of this._mentions) this._buckets[bucketOf(edges, mention.mid)].count += 1;
		const maxCount = Math.max(1, ...this._buckets.map((bucket) => bucket.count));

		// Ticks.
		const tickStep = pickStep(span, (step) => Math.max(2, Math.floor(innerWidth / LABEL_WIDTH[step.unit])));
		const ticks = boundaries(tickStep, lo, hi).filter((day) => day >= lo && day <= hi);

		// Lanes for the points: the lowest lane whose last point ends before this one starts.
		const laneEnds: number[] = [];
		const placed = this._points.map((point) => {
			const radius = point.mentions.length > 1 ? DOT_RADIUS_GROUP : DOT_RADIUS;
			const centre = x(point.mid);
			const periodWidth = x(point.end) - x(point.start);
			const half = Math.max(radius, Math.min(periodWidth / 2, 24));
			let lane = laneEnds.findIndex((end) => end + 3 <= centre - half);
			if (lane === -1) {
				if (laneEnds.length < MAX_LANES) {
					lane = laneEnds.length;
				} else {
					lane = laneEnds.indexOf(Math.min(...laneEnds));
				}
			}
			laneEnds[lane] = centre + half;
			return { point, lane, centre, radius, periodWidth };
		});
		const lanes = Math.max(1, laneEnds.length);

		const stripTop = 6;
		const stripBottom = stripTop + STRIP_HEIGHT;
		const lanesTop = stripBottom + STRIP_GAP;
		const axisY = lanesTop + lanes * LANE_HEIGHT + 10;
		const height = axisY + AXIS_HEIGHT;

		const chart = svg('svg', { width, height, viewBox: `0 0 ${width} ${height}` }, 'tl-svg');
		chart.setAttribute('role', 'group');
		chart.setAttribute('aria-label', 'Dates on a time axis');

		// Grid lines at the ticks.
		const grid = svg('g', {}, 'tl-grid');
		for (const tick of ticks) grid.append(svg('line', { x1: round(x(tick)), y1: stripTop, x2: round(x(tick)), y2: axisY }));
		chart.append(grid);

		// Density strip.
		const bars = svg('g', { role: 'group', 'aria-label': `Mentions per ${stepName(bucketStep)}. Press Enter on a bar to list only that period.` });
		const barElements: SVGGElement[] = [];
		this._buckets.forEach((bucket, i) => {
			if (bucket.count === 0) return;
			const left = x(bucket.start);
			const right = x(bucket.end);
			const barWidth = Math.max(2, right - left - (right - left > 6 ? 2 : 0));
			const barHeight = Math.max(3, (bucket.count / maxCount) * (STRIP_HEIGHT - 14));
			const group = svg('g', { role: 'button', tabindex: -1, 'data-roving': '' }, 'tl-bar');
			group.setAttribute('aria-pressed', 'false');
			group.setAttribute('aria-label', `${this._bucketLabel(bucket)}: ${plural(bucket.count, 'mention', 'mentions')}`);
			group.dataset.bucket = String(i);
			group.append(
				svg('rect', { x: round(left), y: stripTop, width: round(Math.max(2, right - left)), height: STRIP_HEIGHT }, 'tl-bar-hit'),
				svg('rect', { x: round(left + (right - left - barWidth) / 2), y: round(stripBottom - barHeight), width: round(barWidth), height: round(barHeight), rx: 1.5 }, 'tl-bar-fill'),
			);
			if (barWidth >= 20) {
				const label = svg('text', { x: round((left + right) / 2), y: round(stripBottom - barHeight - 3), 'text-anchor': 'middle' }, 'tl-bar-count');
				label.textContent = String(bucket.count);
				group.append(label);
			}
			bucket.element = group;
			barElements.push(group);
			bars.append(group);
		});
		if (barElements.length > 0) barElements[0].setAttribute('tabindex', '0');
		wireRoving(bars, () => barElements);
		bars.addEventListener('click', (event) => {
			const group = (event.target as Element).closest<SVGGElement>('.tl-bar');
			if (!group) return;
			const bucket = this._buckets[Number(group.dataset.bucket)];
			if (!bucket) return;
			const same = this._active && this._active.start === bucket.start && this._active.end === bucket.end;
			this._setActive(same ? null : { start: bucket.start, end: bucket.end });
		});
		chart.append(bars);
		chart.append(svg('line', { x1: MARGIN_X, y1: stripBottom, x2: MARGIN_X + innerWidth, y2: stripBottom }, 'tl-baseline'));

		// Axis.
		const axis = svg('g', {}, 'tl-axis');
		axis.append(svg('line', { x1: MARGIN_X, y1: axisY, x2: MARGIN_X + innerWidth, y2: axisY }, 'tl-axis-line'));
		for (const tick of ticks) {
			const px = round(x(tick));
			axis.append(svg('line', { x1: px, y1: axisY, x2: px, y2: axisY + 5 }, 'tl-tick'));
			const anchor = px < MARGIN_X + 56 ? 'start' : px > width - MARGIN_X - 56 ? 'end' : 'middle';
			const label = svg('text', { x: px, y: axisY + 20, 'text-anchor': anchor }, 'tl-tick-label');
			label.textContent = this._tickLabel(tick, tickStep);
			axis.append(label);
		}
		chart.append(axis);

		// Points, in time order so that the DOM order is the keyboard order.
		const pointsGroup = svg('g', { role: 'group', 'aria-label': 'Dates in time order. Arrow keys move between points, Enter shows the passage.' }, 'tl-points');
		const elements: SVGGElement[] = [];
		const wanted = this._focusedPoint >= 0 ? this._focusedPoint : 0;
		placed.forEach(({ point, lane, centre, radius, periodWidth }, i) => {
			const entry = point.first.entry;
			const cy = round(axisY - 10 - LANE_HEIGHT / 2 - lane * LANE_HEIGHT + 2);
			const cx = round(centre);
			const group = svg('g', { role: 'button', tabindex: i === wanted ? 0 : -1, 'data-roving': '' }, `tl-point tl-s${point.slot} tl-${entry.precision}`);
			group.dataset.point = String(i);
			const count = point.mentions.length;
			group.setAttribute(
				'aria-label',
				`${entry.label}, ${PRECISION_NAMES[entry.precision].toLowerCase()}, ${plural(count, 'mention', 'mentions')}, section ${entry.section}`,
			);
			group.append(svg('circle', { cx, cy, r: radius + 5 }, 'tl-hit'));
			if (entry.precision !== 'day' && periodWidth > 2 * radius + 4) {
				group.append(svg('line', { x1: round(x(point.start) + 1.5), y1: cy, x2: round(x(point.end) - 1.5), y2: cy }, 'tl-span'));
			}
			group.append(svg('circle', { cx, cy, r: radius + 4 }, 'tl-focus'));
			group.append(svg('circle', { cx, cy, r: entry.precision === 'day' ? radius : radius - 1 }, entry.precision === 'day' ? 'tl-dot' : 'tl-ring'));
			if (count > 1) {
				const text = svg('text', { x: cx, y: round(cy + 3.5), 'text-anchor': 'middle' }, 'tl-dot-count');
				text.textContent = count > 99 ? '99+' : String(count);
				group.append(text);
			}
			point.element = group;
			elements.push(group);
			pointsGroup.append(group);
		});
		wireRoving(pointsGroup, () => elements);
		pointsGroup.addEventListener('click', (event) => {
			const group = (event.target as Element).closest<SVGGElement>('.tl-point');
			const point = group ? this._points[this._indexOfPoint(group)] : undefined;
			if (point) this._choose(point.first.entry);
		});
		pointsGroup.addEventListener('pointerover', (event) => this._showTooltipFor(event.target as Element));
		pointsGroup.addEventListener('pointerout', (event) => {
			const next = (event as PointerEvent).relatedTarget as Element | null;
			const from = (event.target as Element).closest('.tl-point');
			if (from && (!next || next.closest?.('.tl-point') !== from)) this._hideTooltip();
		});
		pointsGroup.addEventListener('focusin', (event) => {
			const group = (event.target as Element).closest('.tl-point');
			if (group) this._focusedPoint = Number((group as SVGGElement).dataset.point);
			this._showTooltipFor(event.target as Element);
		});
		pointsGroup.addEventListener('focusout', () => this._hideTooltip());
		chart.append(pointsGroup);

		// Keep the active filter if its bucket still exists at this scale.
		if (this._active && !this._buckets.some((bucket) => bucket.start === this._active?.start && bucket.end === this._active?.end)) {
			this._active = null;
		}
		this._svg?.remove();
		this._svg = chart;
		this._host.append(chart);
		this._caption.textContent = `Mentions per ${stepName(bucketStep)}`;
		this._applyFilter(false);
	}

	/** Position of a point element among the points, in the order they were drawn. */
	private _indexOfPoint(group: Element): number {
		return Number((group as SVGGElement).dataset.point);
	}

	private _tickLabel(day: number, step: Step): string {
		const date = new Date(day * DAY_MS);
		if (step.unit === 'year') return String(date.getUTCFullYear());
		if (step.unit === 'month') return this._intl({ month: 'short', year: 'numeric' }).format(date);
		return this._intl({ day: 'numeric', month: 'short', year: 'numeric' }).format(date);
	}

	/** "1969", "1960 to 1969", "Jul 1969", "20 Jul 1969", "16 Jul 1969 to 22 Jul 1969". */
	private _bucketLabel(bucket: { start: number; end: number }): string {
		const step = this._bucketStep;
		const from = new Date(bucket.start * DAY_MS);
		const to = new Date((bucket.end - 1) * DAY_MS);
		const format = (date: Date): string => this._tickLabel(Math.floor(date.getTime() / DAY_MS), step);
		return step.n === 1 ? format(from) : `${format(from)} to ${format(to)}`;
	}

	/* ---- filter ---- */

	private _setActive(range: { start: number; end: number } | null): void {
		this._active = range;
		this._applyFilter();
		if (range) this._revealList();
	}

	/** Scrolls the dialog just enough to show the head and first row of the list, keeping the chart in view. */
	private _revealList(): void {
		const scroller = this.root.closest('.agentlet-fullscreen-content');
		const wrap = this._list.parentElement;
		if (!scroller || !wrap) return;
		const overflow = wrap.getBoundingClientRect().top + LIST_PEEK - (scroller.getBoundingClientRect().bottom - 24);
		if (overflow > 0) scroller.scrollTop += overflow;
	}

	private _applyFilter(rebuildList = true): void {
		const active = this._active;
		for (const bucket of this._buckets) {
			const on = !!active && bucket.start === active.start && bucket.end === active.end;
			bucket.element?.classList.toggle('tl-bar-active', on);
			bucket.element?.setAttribute('aria-pressed', on ? 'true' : 'false');
		}
		for (const point of this._points) {
			const inside = !active || (point.mid >= active.start && point.mid < active.end);
			point.element?.classList.toggle('tl-dim', !inside);
		}
		const shown = active ? this._mentions.filter((m) => m.mid >= active.start && m.mid < active.end) : this._mentions;
		this._showAll.setAttribute('aria-disabled', active ? 'false' : 'true');
		this._showAll.classList.toggle('tl-button-idle', !active);
		this._status.textContent = active
			? `${shown.length} of ${plural(this._mentions.length, 'mention', 'mentions')}, ${this._bucketLabel(active)}`
			: `All ${plural(this._mentions.length, 'mention', 'mentions')} in time order`;
		if (rebuildList) this._renderList(shown);
	}

	private _renderList(shown: Mention<T>[]): void {
		const fragment = document.createDocumentFragment();
		for (const { entry } of shown) {
			const item = html('li');
			const button = html('button', 'tl-item');
			button.type = 'button';
			const head = html('span', 'tl-item-head');
			head.append(html('span', `tl-swatch tl-s${this._slotOf(entry)}`), html('strong', undefined, entry.label));
			head.append(html('span', 'tl-item-section', entry.section));
			const snippet = html('span', 'tl-item-snippet');
			snippet.append(document.createTextNode(entry.before), html('strong', undefined, entry.label), document.createTextNode(entry.after));
			button.append(head, snippet);
			button.addEventListener('click', () => this._choose(entry));
			item.append(button);
			fragment.append(item);
		}
		this._list.replaceChildren(fragment);
	}

	/* ---- tooltip ---- */

	private _showTooltipFor(target: Element): void {
		const group = target.closest?.('.tl-point');
		if (!group) return;
		const point = this._points[this._indexOfPoint(group)];
		if (!point) return;
		const entry = point.first.entry;
		const tip = this._tooltip;
		const title = html('div', 'tl-tip-title');
		title.append(html('span', `tl-swatch tl-s${point.slot}`), html('strong', undefined, entry.label));
		const count = point.mentions.length;
		if (count > 1) title.append(html('span', 'tl-tip-count', `${count} mentions`));
		const section = html('div', 'tl-tip-section', `${PRECISION_NAMES[entry.precision]} in ${entry.section}`);
		const sentence = html('div', 'tl-tip-sentence');
		sentence.append(document.createTextNode(entry.before), html('strong', undefined, entry.label), document.createTextNode(entry.after));
		tip.replaceChildren(title, section, sentence);
		tip.hidden = false;

		const host = this._host.getBoundingClientRect();
		const box = group.getBoundingClientRect();
		const tipWidth = tip.offsetWidth;
		const tipHeight = tip.offsetHeight;
		const centre = box.left + box.width / 2 - host.left;
		const left = Math.min(Math.max(0, centre - tipWidth / 2), Math.max(0, host.width - tipWidth));
		let top = box.top - host.top - tipHeight - 6;
		if (top < 0) top = box.bottom - host.top + 6;
		tip.style.left = `${Math.round(left)}px`;
		tip.style.top = `${Math.round(top)}px`;
	}

	private _hideTooltip(): void {
		this._tooltip.hidden = true;
	}

	/* ---- actions ---- */

	private _choose(entry: T): void {
		this._selected = entry;
		window.agentlet?.utils.Dialog.hide('select');
	}

	private async _export(): Promise<void> {
		const grid = [
			EXPORT_HEADERS,
			...this._mentions.map(({ entry }) => [
				isoOf(entry),
				PRECISION_NAMES[entry.precision],
				entry.section,
				squash(`${entry.before}${entry.label}${entry.after}`),
			]),
		];
		await exportTable(
			{ label: 'the timeline', sheetName: 'Timeline', data: toTableData(grid) },
			`${slugify(this._options.title, 'article')}-timeline.xlsx`,
		);
	}
}

/* ---------------------------------------------------------------------- */
/* Public entry points                                                     */
/* ---------------------------------------------------------------------- */

let open: { destroy(): void } | null = null;

/** Opens the timeline view. Returns false when there is nothing to show or another dialog is open. */
export function openTimelineView<T extends ViewEntry>(options: TimelineViewOptions<T>): boolean {
	const dialog = window.agentlet?.utils.Dialog;
	if (!dialog || dialog.isActive || options.entries.length === 0) return false;
	const view = new TimelineView(options);
	open = view;
	dialog.show(
		'fullscreen',
		{
			title: `Timeline view: ${options.title}`,
			icon: '',
			customContent: view.root,
			scrollable: true,
			buttons: [{ text: 'Close', value: 'close', primary: true }],
		},
		() => {
			view.destroy();
			open = null;
			const selected = view.takeSelection();
			if (selected) options.onSelect(selected);
			else options.onDismiss?.();
		},
	);
	view.start();
	return true;
}

/** Closes the view if it is open, for example when the agentlet is closed. */
export function closeTimelineView(): void {
	if (open) window.agentlet?.utils.Dialog.hide('close');
}

export const TIMELINE_VIEW_STYLES = `
.tl-root {
	--tl-c0: #0072b2;
	--tl-c1: #c25e00;
	--tl-c2: #008060;
	--tl-c3: #b84a8a;
	--tl-c4: #7b5ea7;
	--tl-c5: #8a6d00;
	--tl-c6: #0c8599;
	--tl-c7: #5a6b7b;
	--tl-c8: #4f7a00;
	--tl-c9: #6b7b88;
	--tl-on-dot: #ffffff;
	--tl-bar: #6b8196;
	--tl-bar-active: #c4601b;
	--tl-grid: rgba(91, 107, 120, 0.22);
	--tl-bg: #ffffff;
	--tl-tip-shadow: 0 6px 20px rgba(15, 51, 80, 0.22);
	font-family: inherit;
	font-size: 14px;
	line-height: 1.45;
	color: var(--color-text);
	display: flex;
	flex-direction: column;
	gap: 14px;
	flex: 1;
	min-width: 0;
	outline: none;
}

@media (prefers-color-scheme: dark) {
	.tl-root {
		--tl-c0: #56b4e9;
		--tl-c1: #f0a04b;
		--tl-c2: #3fcb9b;
		--tl-c3: #e58fc0;
		--tl-c4: #a99be0;
		--tl-c5: #e6c94b;
		--tl-c6: #4fd1e0;
		--tl-c7: #a9b7c4;
		--tl-c8: #a3d14b;
		--tl-c9: #8497a8;
		--tl-on-dot: #0b1a26;
		--tl-bar: #7f9bb5;
		--tl-bar-active: #f4a261;
		--tl-grid: rgba(169, 185, 198, 0.2);
		--tl-bg: #0b1a26;
		--tl-tip-shadow: 0 6px 20px rgba(0, 0, 0, 0.55);
	}
}

.tl-s0 { --tl-c: var(--tl-c0); }
.tl-s1 { --tl-c: var(--tl-c1); }
.tl-s2 { --tl-c: var(--tl-c2); }
.tl-s3 { --tl-c: var(--tl-c3); }
.tl-s4 { --tl-c: var(--tl-c4); }
.tl-s5 { --tl-c: var(--tl-c5); }
.tl-s6 { --tl-c: var(--tl-c6); }
.tl-s7 { --tl-c: var(--tl-c7); }
.tl-s8 { --tl-c: var(--tl-c8); }
.tl-s9 { --tl-c: var(--tl-c9); }

.tl-header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 10px 16px;
}

.tl-summary {
	margin: 0;
	color: var(--color-text-muted);
}

.tl-actions {
	display: flex;
	gap: 8px;
}

.tl-button {
	appearance: none;
	font: inherit;
	font-size: 0.9rem;
	font-weight: 600;
	color: var(--color-heading);
	background: var(--color-surface);
	border: 1.5px solid var(--color-surface-border);
	border-radius: 8px;
	padding: 6px 14px;
	cursor: pointer;
}

.tl-button:hover,
.tl-button:focus-visible {
	border-color: var(--color-accent);
}

.tl-button-primary {
	background: var(--color-primary-bg);
	color: var(--color-primary-text);
	border-color: transparent;
}

.tl-button-primary:hover {
	background: var(--color-primary-bg-hover);
	border-color: transparent;
}

.tl-button-idle {
	opacity: 0.55;
	cursor: default;
}

.tl-legend {
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.85rem;
}

.tl-legend-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-wrap: wrap;
	gap: 4px 16px;
}

.tl-legend-item {
	display: inline-flex;
	align-items: center;
	gap: 6px;
}

.tl-legend-count {
	color: var(--color-text-muted);
	font-size: 0.8rem;
}

.tl-legend-precision {
	color: var(--color-text-muted);
	font-size: 0.8rem;
	gap: 2px 14px;
}

.tl-swatch {
	flex: none;
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--tl-c);
	display: inline-block;
}

.tl-chart {
	position: relative;
	min-width: 0;
}

.tl-chart-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 2px 16px;
	padding-left: 24px;
	margin-bottom: 4px;
}

.tl-caption {
	margin: 0;
	font-size: 0.8rem;
	color: var(--color-text-muted);
}

.tl-svg {
	display: block;
	max-width: 100%;
	overflow: visible;
}

.tl-svg text {
	font-family: inherit;
}

.tl-grid line {
	stroke: var(--tl-grid);
	stroke-width: 1;
}

.tl-baseline,
.tl-axis-line,
.tl-tick {
	stroke: var(--color-text-muted);
	stroke-width: 1;
}

.tl-baseline {
	stroke: var(--color-surface-border);
}

.tl-tick-label {
	font-size: 11.5px;
	fill: var(--color-text-muted);
}

.tl-bar {
	cursor: pointer;
	outline: none;
}

.tl-bar-hit {
	fill: transparent;
	stroke: none;
}

.tl-bar-fill {
	fill: var(--tl-bar);
}

.tl-bar:hover .tl-bar-fill,
.tl-bar-active .tl-bar-fill {
	fill: var(--tl-bar-active);
}

.tl-bar:focus-visible .tl-bar-hit {
	stroke: var(--color-accent);
	stroke-width: 2;
	rx: 3;
}

.tl-bar-count {
	font-size: 10px;
	fill: var(--color-text-muted);
	pointer-events: none;
}

.tl-point {
	cursor: pointer;
	outline: none;
	transition: opacity 0.12s;
}

.tl-point.tl-dim {
	opacity: 0.18;
}

.tl-hit {
	fill: transparent;
	stroke: none;
}

.tl-focus {
	fill: none;
	stroke: none;
}

.tl-point:hover .tl-focus {
	stroke: var(--color-text-muted);
	stroke-width: 1.5;
}

.tl-point:focus-visible .tl-focus {
	stroke: var(--color-heading);
	stroke-width: 2.5;
}

.tl-dot {
	fill: var(--tl-c);
	stroke: var(--tl-bg);
	stroke-width: 1;
}

.tl-ring {
	fill: var(--tl-bg);
	stroke: var(--tl-c);
	stroke-width: 2.25;
}

.tl-span {
	stroke: var(--tl-c);
	stroke-width: 3;
	stroke-linecap: round;
	opacity: 0.5;
}

.tl-dot-count {
	font-size: 10px;
	font-weight: 700;
	fill: var(--tl-on-dot);
	pointer-events: none;
}

.tl-point.tl-month .tl-dot-count,
.tl-point.tl-year .tl-dot-count {
	fill: var(--tl-c);
}

.tl-glyph .tl-dot-count {
	fill: var(--tl-on-dot);
}

.tl-tooltip {
	position: absolute;
	z-index: 5;
	max-width: 340px;
	background: var(--color-surface);
	color: var(--color-text);
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
	box-shadow: var(--tl-tip-shadow);
	padding: 8px 10px;
	font-size: 0.85rem;
	pointer-events: none;
}

.tl-tooltip[hidden] {
	display: none;
}

.tl-tip-title {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--color-heading);
}

.tl-tip-count {
	margin-left: auto;
	font-size: 0.78rem;
	color: var(--color-text-muted);
}

.tl-tip-section {
	font-size: 0.78rem;
	color: var(--color-text-muted);
	margin-bottom: 4px;
}

.tl-tip-sentence {
	overflow-wrap: anywhere;
}

.tl-tip-sentence strong {
	color: var(--color-heading);
}

.tl-list-wrap {
	display: flex;
	flex-direction: column;
	gap: 8px;
	flex: 1 1 240px;
	min-height: 160px;
}

.tl-list-head {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 4px 12px;
}

.tl-list-title {
	margin: 0;
	font-size: 1rem;
	font-weight: 600;
	color: var(--color-heading);
}

.tl-status {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text-muted);
}

.tl-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
	gap: 8px;
	align-content: start;
	overflow-y: auto;
	flex: 1;
	min-height: 0;
}

.tl-item {
	appearance: none;
	width: 100%;
	height: 100%;
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

.tl-item:hover,
.tl-item:focus-visible {
	border-color: var(--color-accent);
}

.tl-item-head {
	display: flex;
	align-items: center;
	gap: 6px;
	color: var(--color-heading);
}

.tl-item-section {
	margin-left: auto;
	font-size: 0.78rem;
	color: var(--color-text-muted);
	text-align: right;
}

.tl-item-snippet {
	font-size: 0.82rem;
	color: var(--color-text-muted);
	overflow-wrap: anywhere;
}

.tl-item-snippet strong {
	color: var(--color-text);
}

@media (prefers-reduced-motion: reduce) {
	.tl-point {
		transition: none;
	}
}
`;
