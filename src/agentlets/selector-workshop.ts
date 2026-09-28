import type { ElementInfo, PageHighlighterHighlightControl, QuickExportField } from 'agentlet-core';
import { buildRobustSelector } from './selector-builder';
import { AGENTLET_BASE_STYLES, sourceLinkHtml } from './shared';

/**
 * "Selector workshop": pick an element on the page, see a robust CSS
 * selector for it, test and edit that selector live, and (for a form
 * field) see the form's structure the way agentlet-core would export it
 * for an AI. Fully deterministic: no AI call, every check reads the live
 * DOM with agentlet-core's own utilities plus this file's own selector
 * builder (see selector-builder.ts).
 *
 * Runs on every page except /docs/ and below, the same pattern as the
 * launcher (src/agentlets/launcher.ts) and page-audit.ts.
 */
const FILE = 'selector-workshop';
const DEMO_SECTION_URL = '/#demo';
const NOT_DOCS_PATTERN = '^(?!.*\\/docs(?:\\/|$)).*$';

/** Debounce for the live selector text field: recomputes matches/highlights this long after the last keystroke. */
const LIVE_EDIT_DEBOUNCE_MS = 300;

/**
 * Safety cap on how many matches actually get a PageHighlighter overlay. A
 * broad selector (e.g. "div", or "*") can match thousands of elements;
 * highlighting every one of them would flood the page and slow it down for
 * no benefit. The match count shown to the visitor is always exact and
 * uncapped; only the number of highlight overlays is capped.
 */
const HIGHLIGHT_LIMIT = 300;

const STYLES = `
.selector-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.selector-empty-state {
	border: 1px dashed var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 16px;
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
	text-align: center;
}

.selector-picking-status {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface, #f4f6f8);
	font-size: 0.85rem;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.selector-picked-summary {
	margin: 0;
	font-size: 0.85rem;
	color: var(--color-text, #3d4f5e);
}

.selector-picked-summary code {
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
}

.selector-editor {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.selector-editor label {
	font-size: 0.8rem;
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.selector-input-row {
	display: flex;
	gap: 8px;
}

.selector-input {
	flex: 1;
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.85rem;
	padding: 6px 8px;
	border-radius: 6px;
	border: 1px solid var(--color-surface-border, #d9e0e6);
	background: var(--color-bg, #ffffff);
	color: var(--color-text, #3d4f5e);
}

.selector-copy-button {
	appearance: none;
	border: 1.5px solid var(--color-surface-border, #d9e0e6);
	border-radius: 8px;
	background: transparent;
	color: var(--color-heading, #0f3350);
	font: inherit;
	font-weight: 600;
	font-size: 0.8rem;
	padding: 6px 12px;
	cursor: pointer;
	white-space: nowrap;
}

.selector-match-status {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-muted, #5b6b78);
}

.selector-error {
	margin: 0;
	font-size: 0.82rem;
	color: #c0392b;
}

.selector-form-export {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.selector-form-export h4,
.selector-snippets h4 {
	margin: 0;
	font-size: 0.9rem;
	color: var(--color-heading, #0f3350);
}

.selector-form-fields {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
	max-height: 200px;
	overflow-y: auto;
}

.selector-form-field {
	display: flex;
	flex-wrap: wrap;
	align-items: baseline;
	gap: 8px;
	font-size: 0.82rem;
	border-bottom: 1px solid var(--color-surface-border, #d9e0e6);
	padding-bottom: 6px;
}

.selector-form-field-label {
	font-weight: 600;
	color: var(--color-text, #3d4f5e);
}

.selector-form-field-selector {
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.78rem;
	color: var(--color-text-muted, #5b6b78);
	word-break: break-all;
}

.selector-form-field-type {
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.72rem;
	text-transform: uppercase;
	letter-spacing: 0.03em;
	padding: 1px 6px;
	border-radius: 999px;
	background: var(--color-badge-bg, #fde8d7);
	color: var(--color-badge-text, #7a3a10);
}

.selector-snippets {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.selector-snippet {
	display: flex;
	align-items: flex-start;
	gap: 8px;
}

.selector-snippet pre {
	flex: 1;
	margin: 0;
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.78rem;
	white-space: pre-wrap;
	word-break: break-word;
	background: var(--color-surface, #f4f6f8);
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 8px;
	padding: 8px 10px;
}

.selector-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.selector-actions button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
`;

class SelectorWorkshopModule extends window.agentlet.Module {
	private _container: HTMLElement | null = null;

	private _picking = false;
	/** setInterval handle watching for an Escape-key cancellation; see _startPicking() for why this is needed. */
	private _pickWatcher: ReturnType<typeof setInterval> | null = null;

	private _pickedInfo: ElementInfo | null = null;
	private _selectorValue = '';
	private _matchCount = 0;
	private _selectorError: string | null = null;
	private _formFields: QuickExportField[] | null = null;

	private _highlights: PageHighlighterHighlightControl[] = [];
	private _liveEditTimeout: ReturnType<typeof setTimeout> | null = null;

	private _closingBubbleShown = false;
	private _closingBubbleTimeout: ReturnType<typeof setTimeout> | null = null;

	// Cached references into the rendered DOM, refreshed on every full
	// render (_wireActions()); used by the live-edit path (_applySelectorLive())
	// to patch specific nodes instead of replacing the whole panel, which
	// would otherwise steal focus and the cursor position from the selector
	// input on every debounced keystroke.
	private _selectorInputEl: HTMLInputElement | null = null;
	private _matchStatusEl: HTMLElement | null = null;
	private _errorEl: HTMLElement | null = null;
	private _snippetQueryEl: HTMLElement | null = null;
	private _snippetHighlightEl: HTMLElement | null = null;
	private _clearHighlightsButtonEl: HTMLButtonElement | null = null;

	constructor() {
		super({
			name: 'selector-workshop',
			description: 'Pick an element and build, test, and edit a robust CSS selector for it.',
			patterns: [{ type: 'regex', value: NOT_DOCS_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Selector workshop';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._stopPicking();
		this._clearHighlights();
		this._clearLiveEditTimeout();
		this._clearClosingBubbleTimeout();
		this._container = null;
	}

	async cleanupModule(): Promise<void> {
		this._stopPicking();
		this._clearHighlights();
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _escape(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	// ---------------------------------------------------------------- //
	// Picking
	// ---------------------------------------------------------------- //

	private _startPicking(): void {
		const elementSelector = window.agentlet?.utils.ElementSelector;
		if (!elementSelector) {
			window.agentlet?.utils.MessageBubble.error('The element selector is not available in this browser.');
			return;
		}
		if (elementSelector.isActive) return;

		this._picking = true;
		this._rerender();

		elementSelector.start(
			(element, info) => {
				this._stopPickWatcher();
				this._picking = false;
				this._handlePicked(element, info);
			},
			{ message: 'Click an element to test its selector. Press Escape to cancel.' },
		);

		// Workaround for a gap in agentlet-core's public ElementSelectorAPI:
		// pressing Escape calls the selector's own internal stop() (it
		// listens for the key itself), which clears isActive and the
		// callback, but never invokes the callback or emits any event this
		// module could react to. Without this poll, _picking would stay
		// true forever after an Escape cancellation (no core bug, just no
		// cancel/stop hook in the public API to react to).
		this._pickWatcher = setInterval(() => {
			if (!elementSelector.isActive && this._picking) {
				this._stopPickWatcher();
				this._picking = false;
				this._rerender();
			}
		}, 250);
	}

	private _stopPickWatcher(): void {
		if (this._pickWatcher !== null) {
			clearInterval(this._pickWatcher);
			this._pickWatcher = null;
		}
	}

	private _stopPicking(): void {
		this._stopPickWatcher();
		if (window.agentlet?.utils.ElementSelector.isActive) {
			window.agentlet.utils.ElementSelector.stop();
		}
		this._picking = false;
	}

	private _cancelPicking(): void {
		this._stopPicking();
		this._rerender();
	}

	private _handlePicked(element: Element, info: ElementInfo): void {
		this._pickedInfo = info;
		this._formFields = this._computeFormFields(element);
		this._applySelector(buildRobustSelector(element, document));
	}

	private _computeFormFields(element: Element): QuickExportField[] | null {
		const form = element.closest('form');
		if (!form) return null;
		const forms = window.agentlet?.forms;
		if (!forms) return null;
		try {
			const fields = forms.quickExport(form);
			return fields.length > 0 ? fields : null;
		} catch {
			return null;
		}
	}

	// ---------------------------------------------------------------- //
	// Selector evaluation, highlighting, and the two render paths
	// ---------------------------------------------------------------- //

	private _evaluateSelector(selectorText: string): { matches: Element[]; error: string | null } {
		const trimmed = selectorText.trim();
		if (trimmed === '') return { matches: [], error: 'Type a CSS selector to test it.' };
		try {
			return { matches: Array.from(document.querySelectorAll(trimmed)), error: null };
		} catch {
			return { matches: [], error: 'This is not a valid CSS selector.' };
		}
	}

	private _highlightMatches(matches: Element[]): void {
		this._clearHighlights();
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) return;
		for (const element of matches.slice(0, HIGHLIGHT_LIMIT)) {
			const control = highlighter.highlight(element, { type: 'border', style: 'primary', animation: 'none' });
			if (control) this._highlights.push(control);
		}
	}

	private _clearHighlights(): void {
		this._highlights.forEach((highlight) => highlight.destroy());
		this._highlights = [];
	}

	/** Full re-render path: used right after a pick, and by actions that are not mid-typing (Clear highlights). */
	private _applySelector(selectorText: string): void {
		this._selectorValue = selectorText;
		const { matches, error } = this._evaluateSelector(selectorText);
		this._selectorError = error;
		this._matchCount = matches.length;
		this._highlightMatches(matches);
		this._rerender();
	}

	/**
	 * Live-edit path: called from the debounced input listener. Patches only
	 * the match status, error message, highlights, and the two snippets,
	 * instead of calling _rerender() (which would replace the input element
	 * itself via innerHTML and drop the visitor's focus and cursor position
	 * on every debounced keystroke).
	 */
	private _applySelectorLive(selectorText: string): void {
		this._selectorValue = selectorText;
		const { matches, error } = this._evaluateSelector(selectorText);
		this._selectorError = error;
		this._matchCount = matches.length;
		this._highlightMatches(matches);
		this._patchLiveUI();
	}

	private _patchLiveUI(): void {
		if (this._matchStatusEl) this._matchStatusEl.textContent = this._matchStatusText();
		if (this._errorEl) {
			this._errorEl.textContent = this._selectorError ?? '';
			this._errorEl.hidden = !this._selectorError;
		}
		if (this._snippetQueryEl) this._snippetQueryEl.textContent = this._snippetQuery(this._selectorValue);
		if (this._snippetHighlightEl) this._snippetHighlightEl.textContent = this._snippetHighlight(this._selectorValue);
		if (this._clearHighlightsButtonEl) this._clearHighlightsButtonEl.disabled = this._highlights.length === 0;
	}

	private _matchStatusText(): string {
		if (this._selectorError) return '';
		return this._matchCount === 1 ? '1 element matches.' : `${this._matchCount} elements match.`;
	}

	private _clearLiveEditTimeout(): void {
		if (this._liveEditTimeout !== null) {
			clearTimeout(this._liveEditTimeout);
			this._liveEditTimeout = null;
		}
	}

	// ---------------------------------------------------------------- //
	// Snippets and clipboard
	// ---------------------------------------------------------------- //

	private _snippetQuery(selector: string): string {
		return `document.querySelector(${JSON.stringify(selector)})`;
	}

	private _snippetHighlight(selector: string): string {
		return `window.agentlet.utils.PageHighlighter.highlight(document.querySelector(${JSON.stringify(selector)}))`;
	}

	private async _copyText(text: string, successMessage: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			window.agentlet?.utils.MessageBubble.success(successMessage);
			this._maybeShowClosingBubble();
		} catch {
			window.agentlet?.utils.MessageBubble.error('Could not copy to the clipboard.');
		}
	}

	/** Shown once, after the first successful copy in this activation (see CLAUDE.md's demo rules). */
	private _maybeShowClosingBubble(): void {
		if (this._closingBubbleShown) return;
		this._closingBubbleShown = true;
		this._closingBubbleTimeout = setTimeout(() => {
			this._closingBubbleTimeout = null;
			window.agentlet?.utils.MessageBubble.show({
				type: 'info',
				message: `This ran on agentlet.io. <a href="${DEMO_SECTION_URL}" style="color: inherit;">See it on a real business app</a>.`,
				allowHtml: true,
				duration: 0,
				closable: true,
			});
		}, 1200);
	}

	private _clearClosingBubbleTimeout(): void {
		if (this._closingBubbleTimeout !== null) {
			clearTimeout(this._closingBubbleTimeout);
			this._closingBubbleTimeout = null;
		}
	}

	// ---------------------------------------------------------------- //
	// Rendering
	// ---------------------------------------------------------------- //

	private _render(): string {
		return `
			<div class="agentlet-panel-body">
				<h3>Selector workshop</h3>
				<p class="selector-intro">
					Pick an element on the page, then test and edit a CSS selector for it. This is a
					deterministic selector tester: it never calls an AI.
				</p>
				${this._renderPickControls()}
				${this._pickedInfo ? this._renderPickedSummary() : ''}
				${this._pickedInfo ? this._renderEditor() : ''}
				${this._formFields ? this._renderFormFields() : ''}
				${this._pickedInfo ? this._renderSnippets() : ''}
				${this._pickedInfo ? this._renderActions() : ''}
				${sourceLinkHtml(FILE)}
			</div>
		`;
	}

	private _renderPickControls(): string {
		if (this._picking) {
			return `
				<div class="selector-picking-status">
					<span>Click an element on the page. Press Escape to cancel.</span>
					<button type="button" class="selector-copy-button" data-action="cancel-pick">Cancel</button>
				</div>
			`;
		}

		const label = this._pickedInfo ? 'Pick a different element' : 'Pick an element';
		const empty = this._pickedInfo
			? ''
			: '<p class="selector-empty-state">Pick an element on the page to get started.</p>';

		return `
			<div class="selector-actions">
				<button type="button" class="agentlet-try-button" data-action="pick">${label}</button>
			</div>
			${empty}
		`;
	}

	private _renderPickedSummary(): string {
		const info = this._pickedInfo;
		if (!info) return '';
		const idPart = info.id ? `#${info.id}` : '';
		const classPart = info.classes.length > 0 ? `.${info.classes.slice(0, 3).join('.')}` : '';
		return `<p class="selector-picked-summary">Picked <code>&lt;${this._escape(info.tagName)}${this._escape(idPart)}${this._escape(classPart)}&gt;</code></p>`;
	}

	private _renderEditor(): string {
		return `
			<div class="selector-editor">
				<label for="selector-workshop-input">Selector</label>
				<div class="selector-input-row">
					<input
						id="selector-workshop-input"
						class="selector-input"
						type="text"
						value="${this._escape(this._selectorValue)}"
						autocomplete="off"
						spellcheck="false"
					/>
					<button type="button" class="selector-copy-button" data-action="copy-selector">Copy</button>
				</div>
				<p class="selector-match-status" data-role="match-status">${this._matchStatusText()}</p>
				<p class="selector-error" data-role="selector-error" ${this._selectorError ? '' : 'hidden'}>${this._escape(this._selectorError ?? '')}</p>
			</div>
		`;
	}

	private _renderFormFields(): string {
		const fields = this._formFields;
		if (!fields || fields.length === 0) return '';

		const rows = fields
			.map((field) => {
				const label = field.label || field.name || field.selector;
				return `
					<li class="selector-form-field">
						<span class="selector-form-field-label">${this._escape(label)}</span>
						<code class="selector-form-field-selector">${this._escape(field.selector)}</code>
						<span class="selector-form-field-type">${this._escape(field.type)}</span>
					</li>
				`;
			})
			.join('');

		return `
			<div class="selector-form-export">
				<h4>Form fields (${fields.length})</h4>
				<ul class="selector-form-fields">${rows}</ul>
				<button type="button" class="selector-copy-button" data-action="copy-form-json">Copy as JSON</button>
			</div>
		`;
	}

	private _renderSnippets(): string {
		return `
			<div class="selector-snippets">
				<h4>Use it in your own code</h4>
				<div class="selector-snippet">
					<pre data-role="snippet-query">${this._escape(this._snippetQuery(this._selectorValue))}</pre>
					<button type="button" class="selector-copy-button" data-action="copy-snippet-query">Copy</button>
				</div>
				<div class="selector-snippet">
					<pre data-role="snippet-highlight">${this._escape(this._snippetHighlight(this._selectorValue))}</pre>
					<button type="button" class="selector-copy-button" data-action="copy-snippet-highlight">Copy</button>
				</div>
			</div>
		`;
	}

	private _renderActions(): string {
		const clearDisabled = this._highlights.length === 0;
		return `
			<div class="selector-actions">
				<button type="button" class="selector-copy-button" data-action="clear-highlights" ${clearDisabled ? 'disabled' : ''}>Clear highlights</button>
			</div>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		this._selectorInputEl = container.querySelector<HTMLInputElement>('#selector-workshop-input');
		this._matchStatusEl = container.querySelector<HTMLElement>('[data-role="match-status"]');
		this._errorEl = container.querySelector<HTMLElement>('[data-role="selector-error"]');
		this._snippetQueryEl = container.querySelector<HTMLElement>('[data-role="snippet-query"]');
		this._snippetHighlightEl = container.querySelector<HTMLElement>('[data-role="snippet-highlight"]');
		this._clearHighlightsButtonEl = container.querySelector<HTMLButtonElement>('[data-action="clear-highlights"]');

		container.querySelector('[data-action="pick"]')?.addEventListener('click', () => {
			this._startPicking();
		});
		container.querySelector('[data-action="cancel-pick"]')?.addEventListener('click', () => {
			this._cancelPicking();
		});
		container.querySelector('[data-action="clear-highlights"]')?.addEventListener('click', () => {
			this._clearHighlights();
			this._rerender();
		});

		this._selectorInputEl?.addEventListener('input', () => {
			const value = this._selectorInputEl?.value ?? '';
			this._clearLiveEditTimeout();
			this._liveEditTimeout = setTimeout(() => {
				this._liveEditTimeout = null;
				this._applySelectorLive(value);
			}, LIVE_EDIT_DEBOUNCE_MS);
		});

		container.querySelector('[data-action="copy-selector"]')?.addEventListener('click', () => {
			const value = this._selectorInputEl?.value ?? this._selectorValue;
			void this._copyText(value, 'Selector copied to the clipboard.');
		});
		container.querySelector('[data-action="copy-form-json"]')?.addEventListener('click', () => {
			if (!this._formFields) return;
			void this._copyText(JSON.stringify(this._formFields, null, 2), 'Form fields copied to the clipboard as JSON.');
		});
		container.querySelector('[data-action="copy-snippet-query"]')?.addEventListener('click', () => {
			const value = this._selectorInputEl?.value ?? this._selectorValue;
			void this._copyText(this._snippetQuery(value), 'Snippet copied to the clipboard.');
		});
		container.querySelector('[data-action="copy-snippet-highlight"]')?.addEventListener('click', () => {
			const value = this._selectorInputEl?.value ?? this._selectorValue;
			void this._copyText(this._snippetHighlight(value), 'Snippet copied to the clipboard.');
		});
	}
}

(window as unknown as Record<string, unknown>).SelectorWorkshopModule = SelectorWorkshopModule;
