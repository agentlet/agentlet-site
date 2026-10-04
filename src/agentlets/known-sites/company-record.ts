import type { RecordCopyResult, RecordValue } from 'agentlet-core';
import { backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from '../shared';
import { COMPANY_RECORD_PATTERN } from './manifest';
import { KNOWN_SITES_SOURCE_DIR, KNOWN_SITE_STYLES, escapeHtml, squash } from './shared';

/**
 * "Copy a company as a record" for Wikipedia and Wikidata.
 *
 * - On a Wikipedia article with a company infobox: reads the name, the
 *   headquarters, the website and the founding year from the infobox.
 * - On a Wikidata item page: reads the label, the website (P856), the
 *   founding date (P571), the street address (P6375), the SIREN (P1616) and
 *   the headquarters city (P159) from the statements shown on the page.
 * - Builds an `organization` record with `window.agentlet.records.create()`
 *   and copies it with `records.copy()`, from the click. Another page that
 *   runs agentlet, such as the supplier form on agentlet.io, pastes it.
 *
 * What it reads is the page itself. Two small lookups go to Wikidata's own
 * API, which both sites' Content-Security-Policy allow (`default-src` lists
 * www.wikidata.org). They are best effort and read only. If one fails, the
 * record is built without that field:
 * - On Wikipedia, the SIREN (P1616) of the linked Wikidata item.
 * - On Wikidata, the country of the headquarters city, because the
 *   company's own country statements can list several countries.
 *
 * Nothing is posted, and the page is not modified.
 *
 * Limits: an infobox is free text, so the headquarters line is split on
 * commas and the last part is taken as the country. That is right for
 * "Paris, France" and wrong for some other shapes. The panel shows every
 * value before it is copied.
 *
 * Markup relied on, as Wikipedia and Wikidata serve it today:
 * - Infobox: `table.infobox`, rows of `th` (label) and `td` (value),
 *   `caption` for the name. The link to the Wikidata item is
 *   `#t-wikibase a` (the "Wikidata item" tool link).
 * - Wikidata: `div.wikibase-statementgroupview#P<number>` holding
 *   `.wikibase-statementview` blocks, each with a
 *   `.wikibase-snakview-value`. Synthetic pages with this markup are the
 *   e2e fixtures.
 */
const FILE = `${KNOWN_SITES_SOURCE_DIR}/company-record`;
const RECORD_TYPE = 'organization';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const LOOKUP_TIMEOUT_MS = 6000;
/** Where the supplier form that pastes this record lives. */
const SUPPLIER_DEMO_URL = 'https://agentlet.io/';

/** Field keys follow the HTML autocomplete vocabulary where one fits (`siren` and `founded` have none). */
const FIELD_LABELS: Record<string, string> = {
	organization: 'Organization',
	url: 'Website',
	'street-address': 'Street address',
	'postal-code': 'Postal code',
	'address-level2': 'City',
	'country-name': 'Country',
	founded: 'Founded',
	siren: 'SIREN',
};

/** Human labels written into the record for keys the autocomplete vocabulary does not name. */
const RECORD_LABELS: Record<string, string> = { siren: 'SIREN', founded: 'Founded' };

const FIELD_ORDER = Object.keys(FIELD_LABELS);

type Fields = Record<string, RecordValue>;

interface WikidataStatement {
	text: string;
	href: string;
	preferred: boolean;
}

/** Lines of visible text in an element, with line breaks kept and footnotes, hidden parts and "years ago" notes dropped. */
function linesOf(element: Element): string[] {
	const copy = element.cloneNode(true) as Element;
	copy
		.querySelectorAll('sup, style, script, .reference, .noprint, .mw-empty-elt, [style*="display:none"], [style*="display: none"]')
		.forEach((node) => node.remove());
	copy.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
	copy.querySelectorAll('li, p, div').forEach((block) => block.append('\n'));
	return (copy.textContent ?? '')
		.replace(/ /g, ' ')
		.split('\n')
		.map(squash)
		.filter(Boolean);
}

function infobox(): HTMLTableElement | null {
	return document.querySelector<HTMLTableElement>('table.infobox');
}

/** Rows of the infobox by label (lowercase, trimmed). The first row with a given label wins. */
function infoboxRows(table: HTMLTableElement): Map<string, Element> {
	const rows = new Map<string, Element>();
	table.querySelectorAll('tr').forEach((row) => {
		const head = row.querySelector(':scope > th');
		const cell = row.querySelector(':scope > td');
		if (!head || !cell) return;
		const label = squash(head.textContent ?? '').toLowerCase();
		if (label && !rows.has(label)) rows.set(label, cell);
	});
	return rows;
}

function rowMatching(rows: Map<string, Element>, pattern: RegExp): Element | null {
	for (const [label, cell] of rows) {
		if (pattern.test(label)) return cell;
	}
	return null;
}

/** English and French labels, which is what the supported editions are tested with. */
const HEADQUARTERS_LABEL = /^(headquarters|head office|registered office|siège|siege)/;
const FOUNDED_LABEL = /^(founded|foundation|fondation|création|creation)/;
const WEBSITE_LABEL = /^(website|web site|site web|site internet|site officiel)/;
const COMPANY_LABELS = /^(headquarters|head office|registered office|siège|siege|founded|foundation|fondation|industry|secteur|forme juridique)/;

/**
 * Splits a headquarters line into address parts. The last part is the
 * country, the one before it the city, and what comes before that the
 * street. A three-part line whose first part has no digit ("Cupertino,
 * California, U.S.") is read as city, region, country, and the region is
 * dropped. A part like "75009 Paris" gives a postal code and a city.
 */
function parseHeadquarters(lines: string[]): Fields {
	const parts = lines.flatMap((line) => line.split(',')).map(squash).filter(Boolean);
	const fields: Fields = {};
	if (parts.length === 0) return fields;
	if (parts.length === 1) {
		fields['address-level2'] = parts[0];
		return fields;
	}

	fields['country-name'] = parts[parts.length - 1];
	const rest = parts.slice(0, -1);
	let city = rest[rest.length - 1];
	let street = rest.slice(0, -1);
	if (rest.length === 2 && !/\d/.test(rest[0])) {
		city = rest[0];
		street = [];
	}

	const postal = /^(\d{4,5})\s+(.+)$/.exec(city);
	if (postal) {
		fields['postal-code'] = postal[1];
		city = postal[2];
	}
	fields['address-level2'] = city;
	if (street.length > 0) fields['street-address'] = street.join(', ');
	return fields;
}

function firstYear(text: string): string {
	return /\b(1[0-9]{3}|20[0-9]{2})\b/.exec(text)?.[1] ?? '';
}

function wikidataItemId(): string {
	const link = document.querySelector<HTMLAnchorElement>('#t-wikibase a');
	return /\bQ\d+\b/.exec(link?.getAttribute('href') ?? '')?.[0] ?? '';
}

/** Fields from the infobox of a Wikipedia article. Empty when the infobox is not a company's. */
function fieldsFromInfobox(): Fields {
	const table = infobox();
	if (!table) return {};
	const rows = infoboxRows(table);
	const isCompany = Array.from(rows.keys()).some((label) => COMPANY_LABELS.test(label));
	if (!isCompany) return {};

	const name = squash(table.querySelector('caption')?.textContent ?? '') || squash(document.getElementById('firstHeading')?.textContent ?? '');
	const fields: Fields = {};
	if (name) fields.organization = name;

	const website = rowMatching(rows, WEBSITE_LABEL);
	const link = website?.querySelector<HTMLAnchorElement>('a[href^="http"]');
	if (link) fields.url = link.href;

	const headquarters = rowMatching(rows, HEADQUARTERS_LABEL);
	if (headquarters) Object.assign(fields, parseHeadquarters(linesOf(headquarters)));

	const founded = rowMatching(rows, FOUNDED_LABEL);
	const year = founded ? firstYear(linesOf(founded)[0] ?? '') : '';
	if (year) fields.founded = year;
	return fields;
}

/** The non-deprecated statements of a Wikidata property group, preferred rank first. */
function statements(property: string): WikidataStatement[] {
	const group = document.getElementById(property);
	if (!group || !group.classList.contains('wikibase-statementgroupview')) return [];
	const found: WikidataStatement[] = [];
	group.querySelectorAll('.wikibase-statementview').forEach((statement) => {
		if (statement.classList.contains('wb-deprecated')) return;
		const value = statement.querySelector('.wikibase-statementview-mainsnak .wikibase-snakview-value');
		const text = squash(value?.textContent ?? '');
		if (!value || !text) return;
		found.push({
			text,
			href: value.querySelector('a')?.getAttribute('href') ?? '',
			preferred: statement.classList.contains('wb-preferred'),
		});
	});
	return [...found.filter((item) => item.preferred), ...found.filter((item) => !item.preferred)];
}

/** Fields from the statements shown on a Wikidata item page. */
function fieldsFromWikidata(): Fields {
	const fields: Fields = {};
	const label = squash(document.querySelector('.wikibase-title-label')?.textContent ?? '') || squash(document.getElementById('firstHeading')?.textContent ?? '');
	if (label) fields.organization = label;

	const website = statements('P856')[0];
	if (website && /^https?:\/\//i.test(website.text)) fields.url = website.text;

	const street = statements('P6375')[0];
	if (street) fields['street-address'] = street.text.replace(/\s*\([a-z-]+\)$/i, '');

	const postal = statements('P281')[0];
	if (postal) fields['postal-code'] = postal.text;

	const city = statements('P159')[0];
	if (city) fields['address-level2'] = city.text;

	// With several countries listed, none is picked here. The headquarters
	// lookup in _enrich() sets one when it can.
	const countries = Array.from(new Set(statements('P17').map((item) => item.text)));
	if (countries.length === 1) fields['country-name'] = countries[0];

	const founded = statements('P571')[0];
	const year = founded ? firstYear(founded.text) : '';
	if (year) fields.founded = year;

	const siren = sirenFrom(statements('P1616')[0]?.text ?? '');
	if (siren) fields.siren = siren;
	return fields;
}

/** A SIREN is nine digits. Spaces are dropped, anything else is rejected. */
function sirenFrom(text: string): string {
	const digits = text.replace(/\s/g, '');
	return /^\d{9}$/.test(digits) ? digits : '';
}

interface WikidataClaimValue {
	mainsnak?: { snaktype?: string; datavalue?: { value?: unknown } };
	rank?: string;
	qualifiers?: Record<string, unknown>;
}

/** Wikidata's "end time" qualifier: the statement no longer holds. */
const END_TIME = 'P582';

/** The best value of a claim list: preferred rank, else the first current one, never deprecated. */
function bestClaimValue(claims: WikidataClaimValue[] | undefined): unknown {
	const usable = (claims ?? []).filter((claim) => claim.rank !== 'deprecated' && claim.mainsnak?.snaktype === 'value');
	const best =
		usable.find((claim) => claim.rank === 'preferred') ?? usable.find((claim) => !claim.qualifiers?.[END_TIME]) ?? usable[0];
	return best?.mainsnak?.datavalue?.value;
}

async function wikidataApi(params: Record<string, string>): Promise<Record<string, unknown>> {
	const url = new URL(WIKIDATA_API);
	Object.entries({ ...params, format: 'json', origin: '*' }).forEach(([key, value]) => url.searchParams.set(key, value));
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
	try {
		const response = await fetch(url.href, { credentials: 'omit', signal: controller.signal });
		if (!response.ok) throw new Error(`Wikidata answered ${response.status}`);
		return (await response.json()) as Record<string, unknown>;
	} finally {
		clearTimeout(timer);
	}
}

/** The claims of one property of one item. */
async function claimsOf(entity: string, property: string): Promise<WikidataClaimValue[]> {
	const data = await wikidataApi({ action: 'wbgetclaims', entity, property });
	const claims = (data.claims ?? {}) as Record<string, WikidataClaimValue[]>;
	return claims[property] ?? [];
}

async function fetchSiren(item: string): Promise<string> {
	const value = bestClaimValue(await claimsOf(item, 'P1616'));
	return typeof value === 'string' ? sirenFrom(value) : '';
}

/** The country of a place, by its label in the page language, else in English. */
async function fetchCountryOf(place: string): Promise<string> {
	const value = bestClaimValue(await claimsOf(place, 'P17')) as { id?: string } | undefined;
	if (!value?.id) return '';
	const language = (document.documentElement.lang || 'en').split('-')[0];
	const data = await wikidataApi({ action: 'wbgetentities', ids: value.id, props: 'labels', languages: `${language}|en` });
	const entities = (data.entities ?? {}) as Record<string, { labels?: Record<string, { value?: string }> }>;
	const labels = entities[value.id]?.labels ?? {};
	return labels[language]?.value ?? labels.en?.value ?? '';
}

const STYLES = `
.cr-fields {
	margin: 0;
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 6px 12px;
	font-size: 0.88rem;
}

.cr-fields dt {
	color: var(--color-text-muted);
}

.cr-fields dd {
	margin: 0;
	color: var(--color-heading);
	font-weight: 600;
	overflow-wrap: anywhere;
}

.cr-result {
	border: 1px solid var(--color-surface-border);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface);
	font-size: 0.88rem;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.cr-result code {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
}

.cr-error {
	border: 1px solid #c0392b;
	background: rgba(192, 57, 43, 0.08);
	color: #c0392b;
	border-radius: 8px;
	padding: 10px 12px;
	font-size: 0.85rem;
}
`;

class CompanyRecordModule extends window.agentlet.Module {
	private _fields: Fields = {};
	private _source: 'wikipedia' | 'wikidata' = 'wikipedia';
	private _scanned = false;
	private _lookup: 'idle' | 'running' | 'done' = 'idle';
	private _lookupNote = '';
	private _result: RecordCopyResult | null = null;
	private _error = '';
	private _container: HTMLElement | null = null;

	constructor() {
		super({
			name: 'company-record',
			description:
				'Reads a company article or Wikidata item and copies it as a structured record, ready to paste into a supplier form on a page that runs agentlet.',
			patterns: [{ type: 'regex', value: COMPANY_RECORD_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Copy a company as a record';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(KNOWN_SITE_STYLES + STYLES);
		this._container = container;
		if (!this._scanned) {
			this._scan();
			void this._enrich();
		}
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	private _scan(): void {
		this._source = /(^|\.)wikidata\.org$/.test(window.location.hostname) ? 'wikidata' : 'wikipedia';
		this._fields = this._source === 'wikidata' ? fieldsFromWikidata() : fieldsFromInfobox();
		this._scanned = true;
	}

	/** Best effort lookups, see the file comment. A failure only leaves a field out. */
	private async _enrich(): Promise<void> {
		this._lookup = 'running';
		try {
			if (this._source === 'wikipedia') {
				const item = wikidataItemId();
				if (item && this._fields.organization) {
					const siren = await fetchSiren(item);
					if (siren) this._fields.siren = siren;
				}
			} else {
				const place = /\/wiki\/(Q\d+)/.exec(statements('P159')[0]?.href ?? '')?.[1];
				if (place && this._fields.organization) {
					const country = await fetchCountryOf(place);
					if (country) this._fields['country-name'] = country;
				}
			}
		} catch (error) {
			this._lookupNote = 'Wikidata could not be reached, so the record may lack some fields.';
			console.debug('Company record lookup failed', error);
		} finally {
			this._lookup = 'done';
			if (this._container) this._renderInto(this._container);
		}
	}

	private _hasRecord(): boolean {
		return Boolean(this._fields.organization);
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wire(container);
	}

	private _render(): string {
		if (!this._hasRecord()) {
			return `
				<div class="agentlet-panel-body">
					<h3>Copy a company as a record</h3>
					<div class="agentlet-empty-state">
						No company found on this page. Open the Wikipedia article of a company, with an infobox
						that lists its headquarters or founding date, or a Wikidata item such as a company.
					</div>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		const rows = FIELD_ORDER.filter((key) => this._fields[key] !== undefined && this._fields[key] !== '')
			.map((key) => `<dt>${escapeHtml(FIELD_LABELS[key])}</dt><dd data-field="${key}">${escapeHtml(String(this._fields[key]))}</dd>`)
			.join('');
		const count = FIELD_ORDER.filter((key) => this._fields[key] !== undefined && this._fields[key] !== '').length;
		const lookup =
			this._lookup === 'running'
				? '<p class="ks-note" data-role="lookup">Looking for more fields on Wikidata...</p>'
				: this._lookupNote
					? `<p class="ks-note" data-role="lookup">${escapeHtml(this._lookupNote)}</p>`
					: '';

		return `
			<div class="agentlet-panel-body">
				<h3>Copy a company as a record</h3>
				<p class="ks-intro">
					A record is data read from this page, not text. Copy it, then paste it into a form on a
					page that runs agentlet, such as the
					<a class="ks-link-button" href="${SUPPLIER_DEMO_URL}" rel="noopener noreferrer">supplier form on agentlet.io</a>.
					The form fills field by field, after a preview.
				</p>
				<ul class="ks-stats">
					<li><strong data-role="field-count">${count}</strong> fields</li>
					<li>Type: <strong>${RECORD_TYPE}</strong></li>
				</ul>
				<dl class="cr-fields">${rows}</dl>
				${lookup}
				<div class="ks-actions">
					<button type="button" class="agentlet-try-button" data-action="copy">Copy as a record</button>
				</div>
				${this._renderResult()}
				<p class="ks-note">
					Check the values first. An infobox is free text, so a headquarters line can be split the
					wrong way. The clipboard can be read by other applications.
				</p>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderResult(): string {
		if (this._error) return `<p class="cr-error" role="alert">${escapeHtml(this._error)}</p>`;
		const result = this._result;
		if (!result) return '';
		const note =
			result.method === 'copy-event'
				? 'The browser refused the clipboard API here, so the record was copied with a copy event.'
				: 'Copied with the clipboard API.';
		return `
			<div class="cr-result" data-role="copy-result" role="status">
				<strong>Copied the record, ${this._copiedFieldCount()} fields.</strong>
				<span>Method: <code data-role="copy-method">${escapeHtml(result.method)}</code>. ${note}</span>
				<span>Formats: <code>${escapeHtml(result.formats.join(', '))}</code></span>
			</div>
		`;
	}

	private _copiedFieldCount(): number {
		return FIELD_ORDER.filter((key) => this._fields[key] !== undefined && this._fields[key] !== '').length;
	}

	private _wire(container: HTMLElement): void {
		container.querySelector('[data-action="copy"]')?.addEventListener('click', () => void this._copy());
		wireBackToLauncher(container);
	}

	/** The record is built first, then copied in the same turn: `records.copy()` must run inside the click. */
	private async _copy(): Promise<void> {
		const records = window.agentlet?.records;
		if (!records) {
			this._error = 'This version of agentlet-core has no records API.';
			if (this._container) this._renderInto(this._container);
			return;
		}
		this._error = '';
		try {
			const fields: Fields = {};
			FIELD_ORDER.forEach((key) => {
				const value = this._fields[key];
				if (value !== undefined && value !== '') fields[key] = value;
			});
			const labels: Record<string, string> = {};
			Object.keys(fields).forEach((key) => {
				if (RECORD_LABELS[key]) labels[key] = RECORD_LABELS[key];
			});
			const record = records.create(RECORD_TYPE, fields, { labels });
			this._result = await records.copy(record);
			window.agentlet?.utils.MessageBubble.success('Copied the record. Paste it into a form that runs agentlet.');
		} catch (error) {
			this._result = null;
			this._error = error instanceof Error ? error.message : String(error);
		}
		if (this._container) this._renderInto(this._container);
	}
}

(window as unknown as Record<string, unknown>).CompanyRecordModule = CompanyRecordModule;
