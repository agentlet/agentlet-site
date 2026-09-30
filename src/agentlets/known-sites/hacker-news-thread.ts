import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { HACKER_NEWS_ITEM_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, addPageStyle, escapeHtml } from './shared';

/**
 * "Thread navigator" for Hacker News item pages.
 *
 * - `j` and `k` move between top-level comments (agentlet-core shortcuts).
 * - "Collapse all" and "Expand all" fold and unfold every top-level thread.
 * - Comments written by the story's author are marked.
 * - "New since your last visit": the ids of the comments seen on a visit are
 *   kept in localStorage under a key that includes the item id, so the next
 *   visit can mark the comments that were not there before.
 *
 * Read only. It never votes, replies, flags or posts, and it does not call
 * any Hacker News endpoint: everything comes from the page already loaded.
 * Marks and folds are CSS classes and attributes on the page's own rows,
 * removed when the agentlet is closed. The page's own collapse links keep
 * working independently.
 *
 * Markup relied on (Hacker News item page): each comment is a
 * `tr.athing.comtr` whose `td.ind[indent]` gives its depth (0 for top
 * level), the author is `.comhead a.hnuser`, and the story's own author is
 * `.fatitem .hnuser`. A synthetic page reproducing this markup is the e2e
 * fixture (tests/e2e/fixtures/known-sites/hacker-news-item.html).
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/hacker-news-thread`;
const STYLE_ID = 'agentlet-known-sites-hn-style';
const STORAGE_PREFIX = 'agentlet-demos:hn-seen:';
const ROW_SELECTOR = 'tr.athing.comtr';

const CURRENT_ATTR = 'data-agentlet-current';
const OP_ATTR = 'data-agentlet-op';
const NEW_ATTR = 'data-agentlet-new';
const COLLAPSED_ATTR = 'data-agentlet-collapsed';
const HIDDEN_ATTR = 'data-agentlet-hidden';
const REPLIES_ATTR = 'data-agentlet-replies';

const PAGE_STYLES = `
tr.comtr[${HIDDEN_ATTR}] { display: none !important; }
tr.comtr[${COLLAPSED_ATTR}] .comment,
tr.comtr[${COLLAPSED_ATTR}] .reply { display: none !important; }
tr.comtr[${COLLAPSED_ATTR}] .comhead::after {
	content: " [" attr(${REPLIES_ATTR}) " hidden]";
	color: #828282;
}
tr.comtr[${OP_ATTR}] td.default { box-shadow: inset 3px 0 0 #f4a261; }
tr.comtr[${OP_ATTR}] .comhead::after {
	content: " (story author)";
	color: #b25a10;
	font-weight: 600;
}
tr.comtr[${COLLAPSED_ATTR}][${OP_ATTR}] .comhead::after {
	content: " (story author) [" attr(${REPLIES_ATTR}) " hidden]";
}
tr.comtr[${NEW_ATTR}] td.default { background: rgba(244, 162, 97, 0.16); }
tr.comtr[${NEW_ATTR}] .comhead::before {
	content: "new ";
	color: #b25a10;
	font-weight: 600;
}
tr.comtr[${CURRENT_ATTR}] td.default { outline: 2px solid #f4a261; outline-offset: -2px; }
`;

interface SeenRecord {
	ids: string[];
	visitedAt: number;
}

function storageKey(itemId: string): string {
	return `${STORAGE_PREFIX}${itemId}`;
}

function readSeen(itemId: string): SeenRecord | null {
	try {
		const raw = window.localStorage.getItem(storageKey(itemId));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<SeenRecord>;
		if (!Array.isArray(parsed.ids)) return null;
		return { ids: parsed.ids.map(String), visitedAt: Number(parsed.visitedAt) || 0 };
	} catch {
		return null;
	}
}

function writeSeen(itemId: string, record: SeenRecord): boolean {
	try {
		window.localStorage.setItem(storageKey(itemId), JSON.stringify(record));
		return true;
	} catch {
		// Storage can be blocked or full: the marks for this visit still work.
		return false;
	}
}

function itemId(): string | null {
	return new URLSearchParams(window.location.search).get('id');
}

function depthOf(row: Element): number {
	const indent = row.querySelector('td.ind')?.getAttribute('indent');
	const depth = Number(indent);
	return Number.isFinite(depth) ? depth : 0;
}

function authorOf(row: Element): string {
	return row.querySelector('.comhead a.hnuser')?.textContent?.trim() ?? '';
}

const STYLES = `
.hn-keys {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 16px;
	font-size: 0.85rem;
}
`;

class HackerNewsThreadModule extends window.agentlet.Module {
	private _container: HTMLElement | null = null;
	private _prepared = false;
	private _rows: HTMLElement[] = [];
	private _topLevel: HTMLElement[] = [];
	private _storyAuthor = '';
	private _authorCommentCount = 0;
	/** Ids that were not in the stored record when this page loaded. Computed once per page. */
	private _newIds = new Set<string>();
	private _previousVisit: number | null = null;
	private _firstVisit = false;
	private _storageOk = true;
	private _current = -1;
	private _shortcutsReady = false;
	private _removePageStyle: (() => void) | null = null;

	constructor() {
		super({
			name: 'hacker-news-thread',
			description: 'Moves between top-level comments with j and k, collapses the thread, and marks what is new since your last visit.',
			patterns: [{ type: 'regex', value: HACKER_NEWS_ITEM_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Thread navigator';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		this._container = container;
		// mount() runs again on every URL change (a comment permalink changes
		// the hash); the page is only prepared, and the visit only recorded,
		// once per activation.
		if (!this._prepared) await this._prepare();
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	async cleanupModule(): Promise<void> {
		this._unregisterShortcuts();
		this._clearPageState();
		this._removePageStyle?.();
		this._removePageStyle = null;
		this._prepared = false;
	}

	private async _prepare(): Promise<void> {
		this._removePageStyle = addPageStyle(STYLE_ID, PAGE_STYLES);
		this._rows = Array.from(document.querySelectorAll<HTMLElement>(ROW_SELECTOR));
		this._topLevel = this._rows.filter((row) => depthOf(row) === 0);
		this._storyAuthor = document.querySelector('.fatitem .hnuser, table.fatitem .hnuser')?.textContent?.trim() ?? '';

		this._markAuthorComments();
		this._markNew();
		this._prepared = true;
		await this._registerShortcuts();
	}

	private _markAuthorComments(): void {
		this._authorCommentCount = 0;
		if (!this._storyAuthor) return;
		for (const row of this._rows) {
			if (authorOf(row) === this._storyAuthor) {
				row.setAttribute(OP_ATTR, '');
				this._authorCommentCount += 1;
			}
		}
	}

	/**
	 * Compares the comment ids on the page with the ids stored by the last
	 * visit, marks the ones that are new, then stores the current set. The
	 * comparison happens before the write, so this visit still shows what
	 * was new; the next visit compares against this one.
	 */
	private _markNew(): void {
		const id = itemId();
		if (!id) return;
		const currentIds = this._rows.map((row) => row.id).filter(Boolean);
		const previous = readSeen(id);

		this._newIds = new Set();
		if (previous) {
			const seen = new Set(previous.ids);
			for (const row of this._rows) {
				if (row.id && !seen.has(row.id)) {
					this._newIds.add(row.id);
					row.setAttribute(NEW_ATTR, '');
				}
			}
			this._previousVisit = previous.visitedAt || null;
			this._firstVisit = false;
		} else {
			this._previousVisit = null;
			this._firstVisit = true;
		}

		const union = new Set([...(previous?.ids ?? []), ...currentIds]);
		this._storageOk = writeSeen(id, { ids: Array.from(union), visitedAt: Date.now() });
	}

	private _clearPageState(): void {
		for (const attr of [CURRENT_ATTR, OP_ATTR, NEW_ATTR, COLLAPSED_ATTR, HIDDEN_ATTR, REPLIES_ATTR]) {
			document.querySelectorAll(`[${attr}]`).forEach((node) => node.removeAttribute(attr));
		}
		this._current = -1;
	}

	private async _registerShortcuts(): Promise<void> {
		const shortcuts = window.agentlet?.utils.shortcuts;
		if (!shortcuts || this._shortcutsReady) return;
		const next = await shortcuts.register('j', () => this._move(1), { description: 'Next top-level comment', scope: 'all' });
		const previous = await shortcuts.register('k', () => this._move(-1), { description: 'Previous top-level comment', scope: 'all' });
		const toggle = await shortcuts.register('c', () => this._toggleCurrent(), { description: 'Collapse or expand the current thread', scope: 'all' });
		this._shortcutsReady = next && previous && toggle;
	}

	private _unregisterShortcuts(): void {
		const shortcuts = window.agentlet?.utils.shortcuts;
		if (!shortcuts || !this._shortcutsReady) return;
		shortcuts.unregister('j');
		shortcuts.unregister('k');
		shortcuts.unregister('c');
		this._shortcutsReady = false;
	}

	private _move(step: 1 | -1): void {
		if (this._topLevel.length === 0) return;
		const nextIndex = this._current < 0 ? (step === 1 ? 0 : this._topLevel.length - 1) : this._current + step;
		if (nextIndex < 0 || nextIndex >= this._topLevel.length) return;
		this._select(nextIndex);
	}

	private _select(index: number): void {
		this._topLevel[this._current]?.removeAttribute(CURRENT_ATTR);
		this._current = index;
		const row = this._topLevel[index];
		row.setAttribute(CURRENT_ATTR, '');
		row.scrollIntoView({ behavior: 'smooth', block: 'center' });
		this._updatePosition();
	}

	private _updatePosition(): void {
		const slot = this._container?.querySelector('[data-role="position"]');
		if (slot) slot.textContent = this._positionText();
	}

	private _positionText(): string {
		return this._current < 0
			? `${this._topLevel.length} top-level comments`
			: `Comment ${this._current + 1} of ${this._topLevel.length}`;
	}

	/** Rows of one thread: the top-level row and every row after it until the next top-level row. */
	private _threadRows(top: HTMLElement): HTMLElement[] {
		const index = this._rows.indexOf(top);
		const rows: HTMLElement[] = [];
		for (let i = index + 1; i < this._rows.length; i += 1) {
			if (depthOf(this._rows[i]) === 0) break;
			rows.push(this._rows[i]);
		}
		return rows;
	}

	private _isCollapsed(top: HTMLElement): boolean {
		return top.hasAttribute(COLLAPSED_ATTR);
	}

	private _collapse(top: HTMLElement): void {
		const replies = this._threadRows(top);
		top.setAttribute(COLLAPSED_ATTR, '');
		top.setAttribute(REPLIES_ATTR, `${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`);
		replies.forEach((row) => row.setAttribute(HIDDEN_ATTR, ''));
	}

	private _expand(top: HTMLElement): void {
		top.removeAttribute(COLLAPSED_ATTR);
		top.removeAttribute(REPLIES_ATTR);
		this._threadRows(top).forEach((row) => row.removeAttribute(HIDDEN_ATTR));
	}

	private _toggleCurrent(): void {
		const top = this._topLevel[this._current];
		if (!top) return;
		if (this._isCollapsed(top)) this._expand(top);
		else this._collapse(top);
		this._updateCollapseState();
	}

	private _setAll(collapsed: boolean): void {
		for (const top of this._topLevel) {
			if (collapsed) this._collapse(top);
			else this._expand(top);
		}
		this._updateCollapseState();
	}

	private _updateCollapseState(): void {
		const slot = this._container?.querySelector('[data-role="collapsed-count"]');
		if (slot) slot.textContent = String(this._topLevel.filter((top) => this._isCollapsed(top)).length);
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _render(): string {
		if (this._topLevel.length === 0) {
			return `
				<div class="agentlet-panel-body">
					<h3>Thread navigator</h3>
					<div class="agentlet-empty-state">No comments on this page.</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const collapsed = this._topLevel.filter((top) => this._isCollapsed(top)).length;
		return `
			<div class="agentlet-panel-body">
				<h3>Thread navigator</h3>
				<p class="ks-intro">
					Move through the top-level comments from the keyboard. Nothing is posted and nothing
					leaves your browser.
				</p>
				<ul class="ks-stats">
					<li><strong>${this._rows.length}</strong> comments</li>
					<li><strong>${this._topLevel.length}</strong> top-level</li>
					<li><strong>${this._authorCommentCount}</strong> by ${this._storyAuthor ? escapeHtml(this._storyAuthor) : 'the author'}</li>
					<li><strong data-role="collapsed-count">${collapsed}</strong> collapsed</li>
				</ul>
				<p class="hn-keys">
					<span><span class="ks-kbd">j</span> next</span>
					<span><span class="ks-kbd">k</span> previous</span>
					<span><span class="ks-kbd">c</span> collapse or expand this thread</span>
				</p>
				<p data-role="position">${this._positionText()}</p>
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="prev">Previous</button>
					<button type="button" class="agentlet-try-button" data-action="next">Next</button>
				</div>
				<div class="ks-actions">
					<button type="button" class="ks-link-button" data-action="collapse-all">Collapse all</button>
					<button type="button" class="ks-link-button" data-action="expand-all">Expand all</button>
				</div>
				${this._renderNewSection()}
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderNewSection(): string {
		if (!itemId()) return '';
		const storageNote = this._storageOk ? '' : '<p class="ks-note">Your browser blocked storage, so this visit cannot be remembered.</p>';
		if (this._firstVisit) {
			return `
				<div class="agentlet-empty-state">
					First visit to this thread. Comments seen now are remembered in this browser, so the next
					visit can mark the new ones.
				</div>
				${storageNote}
			`;
		}
		const since = this._previousVisit ? `since ${new Date(this._previousVisit).toLocaleString()}` : 'since your last visit';
		return `
			<div class="ks-actions">
				<span><strong data-role="new-count">${this._newIds.size}</strong> new comment${this._newIds.size === 1 ? '' : 's'} ${escapeHtml(since)}</span>
				<button type="button" class="ks-link-button" data-action="clear-new">Clear new marks</button>
			</div>
			${storageNote}
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector('[data-action="next"]')?.addEventListener('click', () => this._move(1));
		container.querySelector('[data-action="prev"]')?.addEventListener('click', () => this._move(-1));
		container.querySelector('[data-action="collapse-all"]')?.addEventListener('click', () => this._setAll(true));
		container.querySelector('[data-action="expand-all"]')?.addEventListener('click', () => this._setAll(false));
		container.querySelector('[data-action="clear-new"]')?.addEventListener('click', () => {
			this._rows.forEach((row) => row.removeAttribute(NEW_ATTR));
			this._newIds = new Set();
			this._renderInto(container);
		});
		wireBackToLauncher(container);
	}
}

(window as unknown as Record<string, unknown>).HackerNewsThreadModule = HackerNewsThreadModule;
