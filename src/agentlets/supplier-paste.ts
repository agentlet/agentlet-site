import type { AgentletRecord, RecordFillResult } from 'agentlet-core';
import { AGENTLET_BASE_STYLES, backToLauncherHtml, openSandbox, sourceLinkHtml, wireBackToLauncher } from './shared';

/**
 * "Paste a company as a supplier": the target side of the records demo.
 *
 * The source side is the known-sites demo `company-record`
 * (src/agentlets/known-sites/company-record.ts), which copies a company from
 * Wikipedia or Wikidata. This agentlet fills the supplier form in the home
 * page sandbox (src/components/landing/TrySandbox.astro) from that copy:
 *
 * - `records.onPaste()` listens inside the form only. A Ctrl+V or Cmd+V that
 *   carries an `organization` record opens the core's preview, then fills.
 *   A paste without a record is left alone.
 * - "Paste record" calls `records.pasteFromClipboard()` from a click, the
 *   documented fallback for pages that block paste events.
 * - "Copy a sample company" copies a made-up record, so the demo also works
 *   without visiting Wikipedia.
 *
 * The form's ids, names and labels differ from the record's keys on purpose
 * (a French "Code postal", a country select whose values are codes), so the
 * matching in `records.match()` is visible in the preview. The form is never
 * submitted.
 *
 * Home page only, for the same reason as expense-receipt.ts: the form only
 * exists on `/`. _render() shows a clear message if it is missing.
 */
const HOME_PAGE_PATTERN = '^https?:\\/\\/[^/]+\\/?(?:[?#].*)?$';

const FILE = 'supplier-paste';
const FORM_SELECTOR = '#supplier-form';
const RECORD_TYPE = 'organization';
const KNOWN_SITES_URL = '/try/known-sites/';

/** A made-up company: nothing here is a real organization. */
const SAMPLE_FIELDS = {
	organization: 'Example Supplies SAS',
	siren: '123456789',
	'street-address': '1 rue Exemple',
	'postal-code': '75001',
	'address-level2': 'Paris',
	'country-name': 'France',
	url: 'https://example.com',
	email: 'contact@example.com',
};

const SAMPLE_LABELS = { siren: 'SIREN' };

type StatusKind = 'info' | 'success' | 'warning' | 'error';

const STYLES = `
.sp-intro,
.sp-note {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.sp-note {
	font-size: 0.82rem;
}

.sp-steps {
	margin: 0;
	padding-left: 1.25rem;
	display: flex;
	flex-direction: column;
	gap: 6px;
	font-size: 0.9rem;
}

.sp-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
}

.sp-link {
	color: var(--color-heading, #0f3350);
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
}

.sp-text-button {
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

.sp-status {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 10px 12px;
	background: var(--color-surface, #f4f6f8);
	font-size: 0.88rem;
	margin: 0;
}

.sp-status[data-kind='success'] {
	border-color: var(--color-accent, #f4a261);
}

.sp-status[data-kind='error'] {
	border-color: #c0392b;
	color: #c0392b;
}

.sp-status code {
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.8rem;
}

.sp-actions button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
`;

class SupplierPasteModule extends window.agentlet.Module {
	private _unsubscribe: (() => void) | null = null;
	private _container: HTMLElement | null = null;
	private _statusHtml = '';
	private _statusKind: StatusKind = 'info';
	private _busy = false;

	constructor() {
		super({
			name: 'supplier-paste',
			description: 'Pastes a copied company record into a supplier form, with a preview of how its fields map.',
			patterns: [{ type: 'regex', value: HOME_PAGE_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Paste a company as a supplier';
	}

	/**
	 * Opens the sandbox, brings the supplier form into view and starts
	 * listening for pastes inside it. The listener is removed again in
	 * cleanupModule(), which the core runs on every deactivation.
	 */
	async activateModule(): Promise<void> {
		openSandbox();
		const form = this._form();
		if (!form) return;
		form.scrollIntoView({ behavior: 'smooth', block: 'center' });
		this._unsubscribe?.();
		this._unsubscribe = window.agentlet.records.onPaste(
			(records) => {
				void this._onPaste(records, form);
			},
			{ scope: form, types: [RECORD_TYPE] },
		);
	}

	async cleanupModule(): Promise<void> {
		this._unsubscribe?.();
		this._unsubscribe = null;
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	private _form(): HTMLFormElement | null {
		return document.querySelector<HTMLFormElement>(FORM_SELECTOR);
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _render(): string {
		if (!this._form()) {
			return `
				<div class="agentlet-panel-body">
					<h3>Paste a company as a supplier</h3>
					<p class="sp-intro">
						This demo works on agentlet.io's home page, where the supplier form lives. Go to the
						home page and open this demo again from there.
					</p>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const disabled = this._busy ? 'disabled' : '';
		const status = this._statusHtml
			? `<p class="sp-status" role="status" data-role="status" data-kind="${this._statusKind}">${this._statusHtml}</p>`
			: '';

		return `
			<div class="agentlet-panel-body">
				<h3>Paste a company as a supplier</h3>
				<p class="sp-intro">
					A copied record fills the supplier form field by field, even though the form names its
					fields differently. A preview shows the match before anything is filled.
				</p>
				<ol class="sp-steps">
					<li>
						Copy a company. On Wikipedia or Wikidata, use
						<a class="sp-link" href="${KNOWN_SITES_URL}">the known-sites bookmarklet</a>. Or copy a
						sample company here.
					</li>
					<li>Click in the supplier form and press Ctrl+V (Cmd+V on a Mac). Or press "Paste record".</li>
					<li>Check the preview, then press Fill. The form is never submitted.</li>
				</ol>
				<div class="sp-actions">
					<button type="button" class="agentlet-try-button" data-action="sample" ${disabled}>Copy a sample company</button>
					<button type="button" class="agentlet-try-button" data-action="paste" ${disabled}>Paste record</button>
					<button type="button" class="sp-text-button" data-action="clear">Clear the form</button>
				</div>
				${status}
				<p class="sp-note">
					Paste the same copy into a spreadsheet or a text editor and you get the fields as readable
					lines, with no agentlet involved. The sample company is made up. The clipboard can be read
					by other applications.
				</p>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector('[data-action="sample"]')?.addEventListener('click', () => void this._copySample());
		container.querySelector('[data-action="paste"]')?.addEventListener('click', () => void this._pasteButton());
		container.querySelector('[data-action="clear"]')?.addEventListener('click', () => this._clear());
		wireBackToLauncher(container);
	}

	private _setStatus(html: string, kind: StatusKind): void {
		this._statusHtml = html;
		this._statusKind = kind;
		this._rerender();
	}

	/** Creates the sample record locally and copies it. `copy()` runs inside the click, with no await before it. */
	private async _copySample(): Promise<void> {
		try {
			const record = window.agentlet.records.create(RECORD_TYPE, SAMPLE_FIELDS, { labels: SAMPLE_LABELS });
			const result = await window.agentlet.records.copy(record);
			this._setStatus(
				`Copied the sample company, ${Object.keys(SAMPLE_FIELDS).length} fields. Method: <code data-role="copy-method">${result.method}</code>. Now paste it into the form.`,
				'success',
			);
		} catch (error) {
			this._setStatus(escapeHtml(`Copy failed. ${errorMessage(error)}`), 'error');
		}
	}

	/** Reads the clipboard from the click and fills the form. Chromium may ask for permission first. */
	private async _pasteButton(): Promise<void> {
		const form = this._form();
		if (!form) return;
		this._busy = true;
		this._rerender();
		try {
			const result = await window.agentlet.records.pasteFromClipboard(form, { types: [RECORD_TYPE] });
			this._busy = false;
			if (!result) {
				this._setStatus('The clipboard holds no company record. Copy one first.', 'warning');
				return;
			}
			this._reportFill(result);
		} catch (error) {
			this._busy = false;
			this._setStatus(
				escapeHtml(`The browser did not let this page read the clipboard. Click in the form and paste with the keyboard instead. ${errorMessage(error)}`),
				'error',
			);
		}
	}

	/** A paste inside the form carried a record: the core's preview opens, then it fills. */
	private async _onPaste(records: AgentletRecord[], form: HTMLFormElement): Promise<void> {
		const record = records[0];
		if (!record) return;
		try {
			this._reportFill(await window.agentlet.records.fill(record, form));
		} catch (error) {
			this._setStatus(escapeHtml(`Fill failed. ${errorMessage(error)}`), 'error');
		}
	}

	private _reportFill(result: RecordFillResult): void {
		if (!result.confirmed) {
			this._setStatus('The preview was closed. Nothing was filled.', 'warning');
			return;
		}
		this._setStatus(
			`<span data-role="filled-count">${result.successful}</span> fields filled. The form was not submitted. Check it, then save by hand if you want.`,
			'success',
		);
		window.agentlet?.utils.MessageBubble.info('Check the supplier before saving.', { duration: 6000, closable: true });
	}

	private _clear(): void {
		this._form()?.reset();
		this._setStatus('', 'info');
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

(window as unknown as Record<string, unknown>).SupplierPasteModule = SupplierPasteModule;
