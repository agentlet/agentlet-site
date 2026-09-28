import type { PageHighlighterHighlightControl, TableData } from 'agentlet-core';
import { AGENTLET_BASE_STYLES, openSandbox, showDemoClosingBubbleOnce, sourceLinkHtml } from './shared';

/**
 * "Page audit": a deterministic accessibility and structure audit of the
 * current page. No AI, no network call: every check reads the live DOM with
 * plain browser APIs.
 *
 * Runs on every page except /docs/ and below, the same pattern as the
 * launcher (src/agentlets/launcher.ts), so it can audit any page a visitor
 * happens to be on, not only the home page sandbox.
 *
 * Shadow DOM naturally keeps this audit out of the agentlet's own UI: the
 * core mounts its panel, dialogs, and message bubbles inside an open shadow
 * root (see shared.ts's AGENTLET_BASE_STYLES comment), and a plain
 * `document.querySelectorAll()` from the light DOM, which every check below
 * uses, does not see into it. No extra filtering is needed for that; only
 * hidden *page* content needs an explicit check (see `isHidden()`).
 */
const FILE = 'page-audit';
const NOT_DOCS_PATTERN = '^(?!.*\\/docs(?:\\/|$)).*$';

type CheckId = 'image-alt' | 'heading-hierarchy' | 'table-headers' | 'form-label';
type Severity = 'serious' | 'moderate';

interface Finding {
	check: CheckId;
	severity: Severity;
	element: Element;
	/** Tag plus a short selector or text snippet, for display and for the Excel export. */
	elementDescription: string;
	detail: string;
}

interface CheckDefinition {
	id: CheckId;
	/** Sentence-case label shown as this check's progress-dialog step and report heading. */
	label: string;
	run: () => Finding[];
}

interface AuditRun {
	findings: Finding[];
	ranAt: Date;
	url: string;
	/** True when this run opened the home page's demo sandbox to check it (see openSandbox() in shared.ts); false on every other page, which has none. */
	sandboxOpened: boolean;
}

/**
 * Ends with `.png`/`.jpg`/`.jpeg`/`.gif`/`.svg`/`.webp` (case-insensitive):
 * an accessible-name-shaped string that is actually a leftover file name,
 * the kind an image gets when nobody wrote real alt text for it.
 */
const FILENAME_ALT_PATTERN = /\.(png|jpe?g|gif|svg|webp)$/i;

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/** Input types that are not content fields needing a label (buttons, the hidden-field convention). */
const NON_FIELD_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

/**
 * Hidden by CSS (`display: none`, `visibility: hidden`, the `hidden`
 * attribute, on this element or an ancestor) or by `aria-hidden="true"`.
 * `Element.checkVisibility()` covers the CSS cases including inherited
 * ones; `aria-hidden` is an accessibility-tree concern the CSS check does
 * not know about, so it is checked separately via `closest()`, which also
 * covers an `aria-hidden` ancestor.
 */
function isHidden(element: Element): boolean {
	if (element.closest('[aria-hidden="true"]')) return true;
	if (typeof element.checkVisibility === 'function') {
		return !element.checkVisibility({ checkVisibilityCSS: true });
	}
	// Fallback for a browser old enough to lack checkVisibility(): walk the
	// ancestor chain by hand. Does not catch every case checkVisibility()
	// would (e.g. a hidden <details>), but covers the common ones.
	let current: Element | null = element;
	while (current) {
		const style = window.getComputedStyle(current);
		if (style.display === 'none' || style.visibility === 'hidden') return true;
		current = current.parentElement;
	}
	return false;
}

function truncate(text: string, max: number): string {
	const trimmed = text.trim().replace(/\s+/g, ' ');
	return trimmed.length > max ? `${trimmed.slice(0, Math.max(0, max - 3))}...` : trimmed;
}

/** Tag plus whatever identifies the element most usefully: id, name, first class, or a text snippet. */
function describeElement(element: Element): string {
	const tag = element.tagName.toLowerCase();
	const id = element.getAttribute('id');
	if (id) return `<${tag} id="${id}">`;

	if (element instanceof HTMLImageElement) {
		return `<img src="${truncate(element.getAttribute('src') ?? '', 50)}">`;
	}

	if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
		const name = element.getAttribute('name');
		if (name) return `<${tag} name="${name}">`;
	}

	const firstClass = element.classList[0];
	if (firstClass) return `<${tag} class="${firstClass}">`;

	const text = truncate(element.textContent ?? '', 50);
	return text ? `<${tag}> "${text}"` : `<${tag}>`;
}

function makeFinding(check: CheckId, severity: Severity, element: Element, detail: string): Finding {
	return { check, severity, element, elementDescription: describeElement(element), detail };
}

/** Check 1: images with no alt attribute, or an alt that is really a file name. */
function checkImageAlt(): Finding[] {
	const findings: Finding[] = [];
	document.querySelectorAll('img').forEach((image) => {
		if (isHidden(image)) return;
		const alt = image.getAttribute('alt');
		if (alt === null) {
			findings.push(makeFinding('image-alt', 'serious', image, 'The image has no alt attribute.'));
			return;
		}
		if (FILENAME_ALT_PATTERN.test(alt.trim())) {
			findings.push(makeFinding('image-alt', 'moderate', image, `The alt text looks like a file name ("${alt.trim()}").`));
		}
	});
	return findings;
}

/** Check 2: more than one <h1>, a heading level skipped on the way down, or an empty heading. */
function checkHeadingHierarchy(): Finding[] {
	const findings: Finding[] = [];
	const headings = Array.from(document.querySelectorAll<HTMLElement>(HEADING_SELECTOR)).filter((heading) => !isHidden(heading));

	let previousLevel = 0;
	let h1Count = 0;

	for (const heading of headings) {
		const level = Number(heading.tagName.slice(1));
		const text = (heading.textContent ?? '').trim();

		if (text === '') {
			findings.push(makeFinding('heading-hierarchy', 'serious', heading, `The <h${level}> heading has no text.`));
		}

		if (level === 1) {
			h1Count += 1;
			if (h1Count > 1) {
				findings.push(makeFinding('heading-hierarchy', 'moderate', heading, 'More than one <h1> heading on the page.'));
			}
		} else if (previousLevel > 0 && level > previousLevel + 1) {
			findings.push(
				makeFinding(
					'heading-hierarchy',
					'moderate',
					heading,
					`Heading level jumps from <h${previousLevel}> to <h${level}>, skipping a level.`,
				),
			);
		}

		previousLevel = level;
	}

	return findings;
}

/** Check 3: tables with no header cells, ignoring layout tables marked role="presentation" (or its "none" synonym). */
function checkTableHeaders(): Finding[] {
	const findings: Finding[] = [];
	document.querySelectorAll('table').forEach((table) => {
		if (isHidden(table)) return;
		const role = table.getAttribute('role');
		if (role === 'presentation' || role === 'none') return;
		const hasHeader = table.querySelector('th, [role="columnheader"]') !== null;
		if (!hasHeader) {
			findings.push(makeFinding('table-headers', 'serious', table, 'The table has no header cells (<th> or role="columnheader").'));
		}
	});
	return findings;
}

/** A `<label for>`, a wrapping `<label>`, a non-empty `aria-label`, or an `aria-labelledby` pointing at a real element. */
function hasAccessibleLabel(field: HTMLElement): boolean {
	const ariaLabel = field.getAttribute('aria-label');
	if (ariaLabel && ariaLabel.trim() !== '') return true;

	const labelledBy = field.getAttribute('aria-labelledby');
	if (labelledBy && labelledBy.split(/\s+/).some((id) => id && document.getElementById(id))) return true;

	const id = field.getAttribute('id');
	if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return true;

	return field.closest('label') !== null;
}

/** Check 4: form fields (input/select/textarea) with no accessible label. A placeholder alone never counts. */
function checkFormLabels(): Finding[] {
	const findings: Finding[] = [];
	document.querySelectorAll<HTMLElement>('input, select, textarea').forEach((field) => {
		if (isHidden(field)) return;
		if (field instanceof HTMLInputElement && NON_FIELD_INPUT_TYPES.has(field.type)) return;
		if (hasAccessibleLabel(field)) return;

		const placeholder = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field.placeholder : '';
		const detail = placeholder
			? 'The field has no accessible label (a placeholder alone does not count).'
			: 'The field has no accessible label.';
		findings.push(makeFinding('form-label', 'serious', field, detail));
	});
	return findings;
}

const CHECKS: CheckDefinition[] = [
	{ id: 'image-alt', label: 'Images without proper alt text', run: checkImageAlt },
	{ id: 'heading-hierarchy', label: 'Heading hierarchy', run: checkHeadingHierarchy },
	{ id: 'table-headers', label: 'Tables without header cells', run: checkTableHeaders },
	{ id: 'form-label', label: 'Form fields without a label', run: checkFormLabels },
];

const CHECK_LABELS: Record<CheckId, string> = Object.fromEntries(CHECKS.map((check) => [check.id, check.label])) as Record<
	CheckId,
	string
>;

const STYLES = `
.audit-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.audit-summary {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.85rem;
}

.audit-summary p {
	margin: 0;
}

.audit-summary-total {
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.audit-sandbox-note {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.82rem;
}

.audit-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.audit-link-button {
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

.audit-actions button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
	text-decoration: none;
}

.audit-report {
	display: flex;
	flex-direction: column;
	gap: 16px;
	font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.audit-report-summary {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.audit-report-summary p {
	margin: 0;
}

.audit-empty {
	color: var(--color-text-muted, #5b6b78);
}

.audit-findings {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.audit-finding {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 14px;
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.audit-finding-head {
	display: flex;
	align-items: center;
	gap: 10px;
	flex-wrap: wrap;
}

.audit-severity {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 2px 8px;
	border-radius: 999px;
}

.audit-severity-serious {
	background: rgba(192, 57, 43, 0.12);
	color: #c0392b;
}

.audit-severity-moderate {
	background: var(--color-badge-bg, #fde8d7);
	color: var(--color-badge-text, #7a3a10);
}

.audit-element {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
	word-break: break-word;
}

.audit-detail {
	margin: 0;
	font-size: 0.9rem;
}

.audit-show-button {
	align-self: flex-start;
}
`;

class PageAuditModule extends window.agentlet.Module {
	private _busy = false;
	private _lastRun: AuditRun | null = null;
	private _highlights: PageHighlighterHighlightControl[] = [];
	private _container: HTMLElement | null = null;

	constructor() {
		super({
			name: 'page-audit',
			description: 'Runs a deterministic accessibility and structure audit of the current page.',
			patterns: [{ type: 'regex', value: NOT_DOCS_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Page audit';
	}

	/**
	 * Runs on every page except /docs/ (see NOT_DOCS_PATTERN above), so this
	 * is a no-op away from the home page (see shared.ts's openSandbox() doc
	 * comment). On the home page, it opens the demo sandbox as soon as this
	 * demo becomes active: _runAudit() below opens it again defensively
	 * right before checking the page, in case a visitor closed it back up
	 * by hand in between, but doing it here too means the sandbox is
	 * already visible while the visitor reads this panel, before they even
	 * click "Run the audit".
	 */
	async activateModule(): Promise<void> {
		openSandbox();
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._clearHighlights();
		this._container = null;
	}

	async cleanupModule(): Promise<void> {
		this._clearHighlights();
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

	private _escape(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private _render(): string {
		return `
			<div class="agentlet-panel-body">
				<h3>Page audit</h3>
				<p class="audit-intro">
					Checks this page for images without proper alt text, heading hierarchy problems, tables
					without header cells, and form fields without a label. This audit is fully deterministic:
					it reads the page's own DOM and never calls an AI.
				</p>
				${this._renderSummary()}
				${this._renderActions()}
				${sourceLinkHtml(FILE)}
			</div>
		`;
	}

	private _renderSummary(): string {
		if (!this._lastRun) {
			return '<div class="audit-summary"><p>No audit has run yet.</p></div>';
		}

		const { findings, ranAt, sandboxOpened } = this._lastRun;
		const rows = CHECKS.map((check) => {
			const count = findings.filter((finding) => finding.check === check.id).length;
			return `<p>${this._escape(check.label)}: ${count} finding${count === 1 ? '' : 's'}</p>`;
		}).join('');

		// Only shown when this run actually found and opened the home page's
		// demo sandbox (see openSandbox() in shared.ts): its own defects would
		// otherwise stay hidden and unreported, since a closed <details> hides
		// its content from the checks below the same way display: none would.
		const sandboxNote = sandboxOpened
			? '<p class="audit-sandbox-note">Opened the demo sandbox below so its defects could be checked.</p>'
			: '';

		return `
			<div class="audit-summary">
				${sandboxNote}
				<p class="audit-summary-total">${findings.length} finding${findings.length === 1 ? '' : 's'} at ${this._escape(ranAt.toLocaleTimeString())}</p>
				${rows}
			</div>
		`;
	}

	private _renderActions(): string {
		const runLabel = this._busy ? 'Running...' : 'Run the audit';
		const exportDisabled = !this._lastRun || this._busy;
		const clearDisabled = this._highlights.length === 0;
		return `
			<div class="audit-actions">
				<button type="button" class="agentlet-try-button" data-action="run" ${this._busy ? 'disabled' : ''}>${runLabel}</button>
				<button type="button" class="audit-link-button" data-action="export" ${exportDisabled ? 'disabled' : ''}>Export to Excel</button>
				<button type="button" class="audit-link-button" data-action="clear" ${clearDisabled ? 'disabled' : ''}>Clear highlights</button>
			</div>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelector('[data-action="run"]')?.addEventListener('click', () => {
			void this._runAudit();
		});
		container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
			void this._exportToExcel();
		});
		container.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
			this._clearHighlights();
			this._rerender();
		});
	}

	private async _runAudit(): Promise<void> {
		if (this._busy) return;

		const dialog = window.agentlet?.utils.Dialog;
		if (!dialog) {
			window.agentlet?.utils.MessageBubble.error('The dialog system is not available in this browser.');
			return;
		}

		this._busy = true;
		this._clearHighlights();
		this._rerender();

		// Defensive re-open, in case a visitor closed the sandbox back up by
		// hand since this demo activated (see activateModule() above): the
		// checks below read the live DOM, and a closed <details> hides its
		// content the same way display: none would, which would otherwise
		// make the three deliberate defects it carries unreachable here.
		const sandboxOpened = openSandbox();

		const progress = dialog.showProgressWithSteps(
			CHECKS.map((check) => check.label),
			{ title: 'Running the page audit', autoClose: false, icon: '' },
		);

		const findings: Finding[] = [];
		for (let i = 0; i < CHECKS.length; i++) {
			progress.setStep(i, `Checking: ${CHECKS[i].label.toLowerCase()}`);
			// Short pause so each step is visible; the checks themselves are
			// synchronous and would otherwise flash through instantly.
			await new Promise((resolve) => window.setTimeout(resolve, 200));
			findings.push(...CHECKS[i].run());
		}
		progress.completeProgress('Audit complete');
		await new Promise((resolve) => window.setTimeout(resolve, 400));
		dialog.hide();

		this._lastRun = { findings, ranAt: new Date(), url: window.location.href, sandboxOpened };
		this._busy = false;
		this._rerender();

		this._showReport(findings);
	}

	private _showReport(findings: Finding[]): void {
		const dialog = window.agentlet?.utils.Dialog;
		if (!dialog) return;

		dialog.show(
			'fullscreen',
			{
				title: 'Page audit report',
				icon: '',
				customContent: this._buildReportContent(findings),
				buttons: [{ text: 'Close', value: 'close', primary: true }],
				scrollable: true,
			},
			(value) => {
				if (typeof value === 'string' && value.startsWith('show:')) {
					const index = Number(value.slice('show:'.length));
					const finding = findings[index];
					if (finding) void this._showOnPage(finding);
				} else {
					this._highlightAll(findings);
				}
				// The scenario ends here either way: whether the report was
				// dismissed with Close or with a specific "Show on page".
				// showDemoClosingBubbleOnce() (shared.ts) also gates
				// "Enterprise sign-in (simulated)"'s own closing bubble: page
				// audit requires signing in first (manifest.ts's
				// requiresSignIn), so without a shared gate a visitor who
				// signs in and then completes an audit in the same session
				// would see two identically worded bubbles stacked at once
				// (review round 1).
				window.setTimeout(() => {
					showDemoClosingBubbleOnce();
				}, 800);
			},
		);
	}

	private _buildReportContent(findings: Finding[]): HTMLElement {
		const container = document.createElement('div');
		container.className = 'audit-report';

		const summary = document.createElement('div');
		summary.className = 'audit-report-summary';
		CHECKS.forEach((check) => {
			const count = findings.filter((finding) => finding.check === check.id).length;
			const row = document.createElement('p');
			row.textContent = `${check.label}: ${count} finding${count === 1 ? '' : 's'}`;
			summary.appendChild(row);
		});
		container.appendChild(summary);

		if (findings.length === 0) {
			const empty = document.createElement('p');
			empty.className = 'audit-empty';
			empty.textContent = 'No issues found by these checks.';
			container.appendChild(empty);
			return container;
		}

		const list = document.createElement('ul');
		list.className = 'audit-findings';
		findings.forEach((finding, index) => {
			const item = document.createElement('li');
			item.className = 'audit-finding';

			const head = document.createElement('div');
			head.className = 'audit-finding-head';

			const severity = document.createElement('span');
			severity.className = `audit-severity audit-severity-${finding.severity}`;
			severity.textContent = finding.severity;

			const element = document.createElement('code');
			element.className = 'audit-element';
			element.textContent = finding.elementDescription;

			head.appendChild(severity);
			head.appendChild(element);

			const detail = document.createElement('p');
			detail.className = 'audit-detail';
			detail.textContent = finding.detail;

			const showButton = document.createElement('button');
			showButton.type = 'button';
			showButton.className = 'agentlet-try-button audit-show-button';
			showButton.textContent = 'Show on page';
			showButton.addEventListener('click', () => {
				window.agentlet?.utils.Dialog.hide(`show:${index}`);
			});

			item.appendChild(head);
			item.appendChild(detail);
			item.appendChild(showButton);
			list.appendChild(item);
		});
		container.appendChild(list);

		return container;
	}

	private async _showOnPage(finding: Finding): Promise<void> {
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) return;

		this._clearHighlights();
		await highlighter.scrollTo(finding.element, { block: 'center' });
		const control = highlighter.highlight(finding.element, {
			type: 'border',
			style: finding.severity === 'serious' ? 'danger' : 'warning',
			animation: 'pulse',
			message: finding.detail,
		});
		if (control) this._highlights.push(control);
		this._rerender();
	}

	private _highlightAll(findings: Finding[]): void {
		const highlighter = window.agentlet?.utils.PageHighlighter;
		if (!highlighter) return;

		this._clearHighlights();
		findings.forEach((finding) => {
			const control = highlighter.highlight(finding.element, {
				type: 'border',
				style: finding.severity === 'serious' ? 'danger' : 'warning',
				animation: 'pulse',
				message: finding.detail,
			});
			if (control) this._highlights.push(control);
		});
		this._rerender();
	}

	private async _exportToExcel(): Promise<void> {
		if (!this._lastRun) return;

		const tables = window.agentlet?.tables;
		if (!tables) {
			window.agentlet?.utils.MessageBubble.error('The table export API is not available in this browser.');
			return;
		}

		const headers = ['Check', 'Severity', 'Element', 'Detail', 'Page URL'];
		const rows = this._lastRun.findings.map((finding) => [
			CHECK_LABELS[finding.check],
			finding.severity,
			finding.elementDescription,
			finding.detail,
			this._lastRun?.url ?? window.location.href,
		]);

		const tableData: TableData = {
			headers,
			rows,
			metadata: {
				totalRows: rows.length,
				totalColumns: headers.length,
				extractedAt: new Date().toISOString(),
				tableId: null,
			},
		};

		const result = await tables.download(tableData, { filename: 'page-audit-report.xlsx', sheetName: 'Page audit' });
		if (!result.success) {
			window.agentlet?.utils.MessageBubble.error(`Could not export the report: ${result.error}`);
		}
	}
}

(window as unknown as Record<string, unknown>).PageAuditModule = PageAuditModule;
