import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { trackPageHealth } from './helpers';
import {
	clickBookmarklet,
	OTHER_SITE_URL,
	serveKnownSitesPage,
	serveWikidata,
	serveWikipedia,
	serveWikipediaCompany,
	WIKIDATA_URL,
	WIKIPEDIA_COMPANY_URL,
	WIKIPEDIA_URL,
} from './known-sites-helpers';

/**
 * The records demo: "copy a company, paste it as a supplier".
 *
 * Source side: the known-sites demo `company-record`
 * (src/agentlets/known-sites/company-record.ts), run on Wikipedia and
 * Wikidata fixtures served with their real Content-Security-Policy headers.
 * Target side: the on-site `supplier-paste` agentlet
 * (src/agentlets/supplier-paste.ts) and the supplier form of the home page
 * sandbox. Both use window.agentlet.records from agentlet-core 2.3.0.
 *
 * The clipboard is granted per origin, as the other specs do. The tests that
 * need to read the copy back paste it into a textarea and decode it with
 * records.fromPasteEvent(), which is what a real target page does.
 */

const PANEL_TITLE = '#agentlet-app-name';
const CLIPBOARD = ['clipboard-read', 'clipboard-write'];

const DANONE_FROM_WIKIPEDIA = {
	organization: 'Danone S.A.',
	url: 'https://www.danone.com/',
	'street-address': 'Rue La Fayette, 9th arrondissement',
	'address-level2': 'Paris',
	'country-name': 'France',
	founded: '1966',
	siren: '552032534',
};

const DANONE_FROM_WIKIDATA = {
	organization: 'Danone',
	url: 'https://www.danone.com/',
	'address-level2': 'Paris',
	'country-name': 'France',
	founded: '1919',
	siren: '552032534',
};

type PastedRecord = { type: string; fields: Record<string, unknown>; labels?: Record<string, string>; source?: { origin: string } };

/** Pastes the clipboard into a textarea and decodes it the way a target page does. */
async function readCopiedRecord(page: Page): Promise<PastedRecord | null> {
	await page.evaluate(() => {
		const w = window as unknown as { agentlet: { records: { fromPasteEvent(e: ClipboardEvent): unknown[] | null } }; __pasted?: unknown };
		w.__pasted = undefined;
		document.getElementById('record-sink')?.remove();
		const area = document.createElement('textarea');
		area.id = 'record-sink';
		area.setAttribute('aria-label', 'Test sink');
		area.style.cssText = 'position:fixed;bottom:0;left:0;z-index:2147483645';
		document.body.appendChild(area);
		area.addEventListener('paste', (event) => {
			w.__pasted = w.agentlet.records.fromPasteEvent(event) ?? null;
		});
		area.focus();
	});
	await page.keyboard.press('ControlOrMeta+V');
	await page.waitForFunction(() => (window as unknown as { __pasted?: unknown }).__pasted !== undefined);
	const records = await page.evaluate(() => (window as unknown as { __pasted: unknown[] | null }).__pasted);
	return (records?.[0] as PastedRecord | undefined) ?? null;
}

async function copyFromPanel(page: Page, context: BrowserContext, origin: string): Promise<void> {
	await context.grantPermissions(CLIPBOARD, { origin });
	await page.getByRole('button', { name: 'Copy as a record' }).click();
	await expect(page.locator('[data-role="copy-result"]')).toBeVisible();
	await expect(page.locator('[data-role="copy-method"]')).toHaveText(/^(clipboard-api|copy-event)$/);
}

/** Opens the supplier-paste demo on the home page. */
async function openSupplierDemo(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Try it on this page' }).click();
	await page.locator('[data-try="supplier-paste"]').click();
	await expect(page.locator(PANEL_TITLE)).toHaveText('Paste a company as a supplier');
	await expect(page.locator('#sandbox')).toHaveJSProperty('open', true);
	await expect(page.locator('#supplier-form')).toBeInViewport();
}

async function expectSupplierFilled(page: Page): Promise<void> {
	await expect(page.locator('#supplier-legal-name')).toHaveValue('Example Supplies SAS');
	await expect(page.locator('#supplier-registration')).toHaveValue('123456789');
	await expect(page.locator('#supplier-line')).toHaveValue('1 rue Exemple');
	await expect(page.locator('#supplier-zip')).toHaveValue('75001');
	await expect(page.locator('#supplier-town')).toHaveValue('Paris');
	await expect(page.locator('#supplier-nation')).toHaveValue('FR');
	await expect(page.locator('#supplier-web')).toHaveValue('https://example.com');
	await expect(page.locator('#supplier-contact')).toHaveValue('contact@example.com');
}

test.describe('Records demo, source: Wikipedia and Wikidata', () => {
	test('Wikipedia: builds an organization record from the infobox and adds the SIREN from Wikidata', async ({ page, context }) => {
		const run = await serveWikipediaCompany(page);
		const health = await trackPageHealth(page);
		await page.goto(WIKIPEDIA_COMPANY_URL);
		await clickBookmarklet(page);

		await expect(page.getByText('Demos for Wikipedia')).toBeVisible();
		await page.locator('[data-try="company-record"]').click();
		await expect(page.locator(PANEL_TITLE)).toHaveText('Copy a company as a record');

		// The panel shows what will be copied, and the SIREN arrives from Wikidata.
		await expect(page.locator('[data-field="organization"]')).toHaveText('Danone S.A.');
		await expect(page.locator('[data-field="siren"]')).toHaveText('552032534');
		await expect(page.locator('[data-field="address-level2"]')).toHaveText('Paris');
		await expect(page.locator('[data-field="country-name"]')).toHaveText('France');
		await expect(page.locator('[data-role="lookup"]')).toHaveCount(0);

		await copyFromPanel(page, context, 'https://en.wikipedia.org');
		const record = await readCopiedRecord(page);
		expect(record?.type).toBe('organization');
		expect(record?.fields).toEqual(DANONE_FROM_WIKIPEDIA);
		expect(record?.labels).toEqual({ siren: 'SIREN', founded: 'Founded' });
		expect(record?.source?.origin).toBe('https://en.wikipedia.org');

		// The only extra host the demo talks to is Wikidata's API, which the page's policy allows.
		const external = run.requests.filter((entry) => !entry.startsWith('en.wikipedia.org/') && !entry.startsWith('cdn.jsdelivr.net/'));
		expect(external.every((entry) => entry.startsWith('www.wikidata.org/w/api.php?'))).toBe(true);
		expect(external.length).toBe(1);
		expect(await run.cspViolations()).toEqual([]);
		expect(health.consoleErrors).toEqual([]);
	});

	test('Wikipedia: the record is still built when Wikidata cannot be reached', async ({ page, context }) => {
		await serveKnownSitesPage(page, {
			html: readFileSync(new URL('./fixtures/known-sites/wikipedia-company.html', import.meta.url), 'utf8'),
			url: WIKIPEDIA_COMPANY_URL,
			// No `respond`: the Wikidata API answers 204 with an empty body, as a failed lookup.
		});
		await page.goto(WIKIPEDIA_COMPANY_URL);
		await clickBookmarklet(page);
		await page.locator('[data-try="company-record"]').click();
		await expect(page.locator('[data-role="lookup"]')).toContainText('Wikidata could not be reached');
		await expect(page.locator('[data-field="siren"]')).toHaveCount(0);

		await copyFromPanel(page, context, 'https://en.wikipedia.org');
		const record = await readCopiedRecord(page);
		const withoutSiren: Record<string, unknown> = { ...DANONE_FROM_WIKIPEDIA };
		delete withoutSiren.siren;
		expect(record?.fields).toEqual(withoutSiren);
	});

	test('Wikipedia: an article without a company infobox gets a clear message', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await clickBookmarklet(page);
		await expect(page.locator('.agentlet-demo-card')).toHaveCount(3);
		await page.locator('[data-try="company-record"]').click();
		await expect(page.locator('.agentlet-empty-state')).toContainText('No company found on this page');
		await expect(page.getByRole('button', { name: 'Copy as a record' })).toHaveCount(0);
	});

	test('Wikidata: opens the demo directly and builds the record from the statements', async ({ page, context }) => {
		const run = await serveWikidata(page);
		const health = await trackPageHealth(page);
		await page.goto(WIKIDATA_URL);
		await clickBookmarklet(page);

		await expect(page.locator(PANEL_TITLE)).toHaveText('Copy a company as a record');
		await expect(page.locator('[data-field="organization"]')).toHaveText('Danone');
		// The preferred website wins over the other two. The item lists two countries, so the
		// country comes from the headquarters city (Paris), looked up on Wikidata.
		await expect(page.locator('[data-field="url"]')).toHaveText('https://www.danone.com/');
		await expect(page.locator('[data-field="country-name"]')).toHaveText('France');
		await expect(page.locator('[data-field="siren"]')).toHaveText('552032534');
		await expect(page.locator('[data-role="lookup"]')).toHaveCount(0);

		await copyFromPanel(page, context, 'https://www.wikidata.org');
		const record = await readCopiedRecord(page);
		expect(record?.type).toBe('organization');
		expect(record?.fields).toEqual(DANONE_FROM_WIKIDATA);
		expect(record?.source?.origin).toBe('https://www.wikidata.org');

		expect(await run.cspViolations()).toEqual([]);
		expect(health.consoleErrors).toEqual([]);
	});

	test('copy falls back to a copy event when the clipboard API is refused', async ({ page }) => {
		await serveWikidata(page);
		await page.goto(WIKIDATA_URL);
		// Same refusal an embedded pane or a webview gives.
		await page.addInitScript(() => {
			Object.defineProperty(navigator.clipboard, 'write', {
				value: () => Promise.reject(new DOMException('Write permission denied', 'NotAllowedError')),
			});
		});
		await page.reload();
		await clickBookmarklet(page);
		await page.getByRole('button', { name: 'Copy as a record' }).click();
		await expect(page.locator('[data-role="copy-method"]')).toHaveText('copy-event');
		const record = await readCopiedRecord(page);
		expect(record?.fields).toEqual(DANONE_FROM_WIKIDATA);
	});
});

test.describe('Records demo, target: the supplier form on agentlet.io', () => {
	test('the supplier form works by hand and sends nothing', async ({ page }) => {
		const posts: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') posts.push(request.url());
		});
		await page.goto('/');
		await page.locator('#sandbox summary').click();
		const form = page.locator('#supplier-form');
		await expect(form).toBeVisible();
		await form.getByLabel('Supplier name').fill('By hand SAS');
		await form.getByRole('button', { name: 'Save supplier' }).click();
		await expect(page.locator('[data-supplier-status]')).toHaveText('Demo form. Nothing was sent.');
		expect(posts).toEqual([]);
		// The form carries no autocomplete attribute and uses names unlike the record keys.
		expect(await form.locator('[autocomplete]').count()).toBe(0);
		expect(await form.locator('#supplier-zip').getAttribute('name')).toBe('zip');
		await expect(form.getByLabel('Code postal')).toBeVisible();
	});

	test('a sample company is copied, then a keyboard paste opens the preview and Fill fills the form', async ({ page, context }) => {
		await context.grantPermissions(CLIPBOARD);
		const health = await trackPageHealth(page);
		await openSupplierDemo(page);

		await page.getByRole('button', { name: 'Copy a sample company' }).click();
		await expect(page.locator('[data-role="status"]')).toContainText('Copied the sample company');
		await expect(page.locator('[data-role="copy-method"]')).toHaveText(/^(clipboard-api|copy-event)$/);

		await page.locator('#supplier-legal-name').click();
		await page.keyboard.press('ControlOrMeta+V');

		// The core's preview: every record field is listed with the form field it maps to.
		const preview = page.locator('.agentlet-dialog-overlay');
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('Example Supplies SAS');
		await expect(preview).toContainText('123456789');
		// Nothing is filled before the visitor confirms.
		await expect(page.locator('#supplier-legal-name')).toHaveValue('');
		await preview.getByRole('button', { name: 'Fill', exact: true }).click();

		await expectSupplierFilled(page);
		await expect(page.locator('[data-role="filled-count"]')).toHaveText('8');
		await expect(page.locator('[data-role="status"]')).toContainText('The form was not submitted');
		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('closing the preview fills nothing', async ({ page, context }) => {
		await context.grantPermissions(CLIPBOARD);
		await openSupplierDemo(page);
		await page.getByRole('button', { name: 'Copy a sample company' }).click();
		await expect(page.locator('[data-role="copy-method"]')).toBeVisible();
		await page.locator('#supplier-legal-name').click();
		await page.keyboard.press('ControlOrMeta+V');
		const preview = page.locator('.agentlet-dialog-overlay');
		await expect(preview).toBeVisible();
		await preview.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.locator('[data-role="status"]')).toContainText('Nothing was filled');
		await expect(page.locator('#supplier-legal-name')).toHaveValue('');
	});

	test('a plain-text paste into the form is left alone', async ({ page, context }) => {
		await context.grantPermissions(CLIPBOARD);
		await openSupplierDemo(page);
		await page.evaluate(() => navigator.clipboard.writeText('just some text'));
		await page.locator('#supplier-legal-name').click();
		await page.keyboard.press('ControlOrMeta+V');
		await expect(page.locator('#supplier-legal-name')).toHaveValue('just some text');
		await expect(page.locator('.agentlet-dialog-overlay')).toHaveCount(0);
	});

	test('the Paste record button reads the clipboard from the click and fills the form', async ({ page, context }) => {
		await context.grantPermissions(CLIPBOARD);
		await openSupplierDemo(page);
		await page.getByRole('button', { name: 'Copy a sample company' }).click();
		await expect(page.locator('[data-role="copy-method"]')).toBeVisible();

		await page.getByRole('button', { name: 'Paste record' }).click();
		const preview = page.locator('.agentlet-dialog-overlay');
		await expect(preview).toBeVisible();
		await preview.getByRole('button', { name: 'Fill', exact: true }).click();
		await expectSupplierFilled(page);
	});

	test('the Paste record button says so when the clipboard holds no record', async ({ page, context }) => {
		await context.grantPermissions(CLIPBOARD);
		await openSupplierDemo(page);
		await page.evaluate(() => navigator.clipboard.writeText('no record here'));
		await page.getByRole('button', { name: 'Paste record' }).click();
		await expect(page.locator('[data-role="status"]')).toContainText('The clipboard holds no company record');
		await expect(page.locator('#supplier-legal-name')).toHaveValue('');
	});

	test('the panel explains the flow and links to the known-sites page', async ({ page }) => {
		await openSupplierDemo(page);
		const panel = page.locator('#agentlet-container');
		await expect(panel.locator('.sp-steps li')).toHaveCount(3);
		await expect(panel.getByRole('link', { name: 'the known-sites bookmarklet' })).toHaveAttribute('href', '/try/known-sites/');
		await expect(panel).toContainText('Paste the same copy into a spreadsheet');
	});

	test('a company copied on Wikipedia fills the supplier form', async ({ browser, baseURL }) => {
		const context = await browser.newContext({ baseURL });
		await context.grantPermissions(CLIPBOARD, { origin: 'https://en.wikipedia.org' });
		const source = await context.newPage();
		await serveWikipediaCompany(source);
		await source.goto(WIKIPEDIA_COMPANY_URL);
		await clickBookmarklet(source);
		await source.locator('[data-try="company-record"]').click();
		await expect(source.locator('[data-field="siren"]')).toHaveText('552032534');
		await source.getByRole('button', { name: 'Copy as a record' }).click();
		await expect(source.locator('[data-role="copy-result"]')).toBeVisible();

		const target = await context.newPage();
		await target.goto('/');
		await target.getByRole('button', { name: 'Try it on this page' }).click();
		await target.locator('[data-try="supplier-paste"]').click();
		await target.locator('#supplier-legal-name').click();
		await target.keyboard.press('ControlOrMeta+V');
		const preview = target.locator('.agentlet-dialog-overlay');
		await expect(preview).toBeVisible();
		await preview.getByRole('button', { name: 'Fill', exact: true }).click();

		await expect(target.locator('#supplier-legal-name')).toHaveValue('Danone S.A.');
		await expect(target.locator('#supplier-registration')).toHaveValue('552032534');
		await expect(target.locator('#supplier-town')).toHaveValue('Paris');
		await expect(target.locator('#supplier-nation')).toHaveValue('FR');
		await expect(target.locator('#supplier-web')).toHaveValue('https://www.danone.com/');
		await context.close();
	});
});

test.describe('Records demo, listings', () => {
	test('the on-site launcher lists the supplier demo under Business', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		const card = page.locator('[data-demo="supplier-paste"]');
		await expect(card).toContainText('Paste a company as a supplier');
		await expect(card).toContainText('Business');
	});

	test('the Wikipedia launcher lists the company record demo, and an unsupported site lists Wikidata', async ({ page }) => {
		await serveWikipediaCompany(page);
		await page.goto(WIKIPEDIA_COMPANY_URL);
		await clickBookmarklet(page);
		await expect(page.locator('[data-demo="company-record"]')).toContainText('Copy a company as a record');

		const other = await page.context().newPage();
		await serveKnownSitesPage(other, { html: '<!doctype html><title>Example</title><h1>Example</h1>', url: OTHER_SITE_URL });
		await other.goto(OTHER_SITE_URL);
		await clickBookmarklet(other);
		await expect(other.getByText('No demo for this page')).toBeVisible();
		const text = (await other.locator('#agentlet-container').innerText()).replace(/\s+/g, ' ');
		expect(text).toContain('Wikidata');
		expect(text).toContain('Copy a company as a record');
		await expect(other.getByRole('link', { name: 'Danone on Wikidata' })).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q329426');
	});

	test('the known-sites page lists Wikidata and the new demo', async ({ page }) => {
		await page.goto('/try/known-sites/');
		const main = page.locator('main');
		await expect(main.getByRole('heading', { name: 'Wikidata' })).toBeVisible();
		await expect(main).toContainText('Copy a company as a record');
		await expect(main.getByRole('link', { name: 'Danone on Wikidata' })).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q329426');
		await expect(main.getByRole('link', { name: 'Danone on English Wikipedia' })).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Danone');
	});
});
