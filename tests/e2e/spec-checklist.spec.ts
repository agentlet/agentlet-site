import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import {
	clickBookmarklet,
	EURLEX_URL,
	RFC_URL,
	serveKnownSitesPage,
	serveSpec,
	W3C_TR_URL,
	WCAG_URL,
} from './known-sites-helpers';

/**
 * "Spec to checklist" (src/agentlets/known-sites/spec-checklist.ts and
 * spec-extract.ts) on W3C Technical Reports, RFC Editor and EUR-Lex. Like
 * known-sites.spec.ts, nothing touches a real site: trimmed fixtures are
 * served as if from the real hosts with the Content-Security-Policy header
 * each one really sent (see tests/e2e/fixtures/known-sites/README.md), and
 * jsDelivr is answered from the local build.
 */

const PANEL_TITLE = '#agentlet-app-name';
const ROWS = '.sc-row';
const RFC_SENTENCE = 'a sender SHOULD generate the optional whitespace';

async function readWorkbook(download: Download): Promise<XLSX.WorkBook> {
	const path = await download.path();
	expect(path).toBeTruthy();
	return XLSX.read(readFileSync(path as string), { type: 'buffer' });
}

function levelsOf(page: Page): Promise<string[]> {
	return page.locator(ROWS).locator('.sc-level').allTextContents();
}

function idsOf(page: Page): Promise<string[]> {
	return page.locator(ROWS).locator('.sc-id').allTextContents();
}

test.describe('Spec to checklist: extraction', () => {
	test('WCAG: one row per success criterion with its level, under the real W3C policy', async ({ page }) => {
		const run = await serveSpec(page, 'wcag');
		await page.goto(WCAG_URL);
		await clickBookmarklet(page);

		// A single demo for this page opens directly.
		await expect(page.locator(PANEL_TITLE)).toHaveText('Spec to checklist');
		await expect(page.locator(ROWS)).toHaveCount(3);
		expect(await idsOf(page)).toEqual(['1.1.1', '1.4.3', '1.4.6']);
		expect(await levelsOf(page)).toEqual(['A', 'AA', 'AAA']);
		// The obsolete 4.1.1 has no level, and the keywords of the conformance section are not requirements.
		await expect(page.locator('.sc-list')).not.toContainText('Parsing');
		await expect(page.locator(ROWS).first()).toContainText('Non-text Content');
		await expect(page.locator(ROWS).first()).toContainText('All non-text content that is presented to the user has a text alternative');
		await expect(page.locator(ROWS).nth(1).locator('.sc-link')).toHaveAttribute('href', `${WCAG_URL}#contrast-minimum`);

		await page.getByLabel('Filter by level').selectOption('AA');
		await expect(page.locator(ROWS)).toHaveCount(1);
		await expect(page.locator(ROWS)).toContainText('Contrast (Minimum)');

		expect(await run.cspViolations()).toEqual([]);
	});

	test('W3C Technical Report: sentences around em.rfc2119, skipping notes and examples', async ({ page }) => {
		const run = await serveSpec(page, 'w3c');
		await page.goto(W3C_TR_URL);
		await clickBookmarklet(page);

		await expect(page.locator(ROWS)).toHaveCount(4);
		expect(await idsOf(page)).toEqual(['2.1a', '2.1b', '2.2a', '2.2b']);
		expect(await levelsOf(page)).toEqual(['MUST', 'SHOULD', 'MAY', 'MUST']);
		await expect(page.locator(ROWS).first()).toContainText('A client MUST send a widget identifier.');
		await expect(page.locator(ROWS).first().locator('.sc-link')).toHaveAttribute('href', `${W3C_TR_URL}#client-rules`);
		await expect(page.locator('.sc-list')).not.toContainText('quoted here');
		await expect(page.locator('.sc-list')).not.toContainText('read this note');
		expect(await run.cspViolations()).toEqual([]);
	});

	test('RFC: sentences with BCP 14 keywords, with section number and anchor', async ({ page }) => {
		const run = await serveSpec(page, 'rfc');
		await page.goto(RFC_URL);
		await clickBookmarklet(page);

		await expect(page.locator(PANEL_TITLE)).toHaveText('Spec to checklist');
		const levels = await levelsOf(page);
		expect(levels.length).toBeGreaterThan(8);
		expect(new Set(levels)).toEqual(new Set(['MUST', 'SHOULD', 'MAY']));
		// Two requirements in one paragraph get a letter each.
		expect(await idsOf(page)).toEqual(expect.arrayContaining(['2.2-5a', '2.2-5b']));
		// The sentence that defines the keywords is not a requirement.
		await expect(page.locator('.sc-list')).not.toContainText('interpreted as described in BCP 14');

		const row = page.locator(ROWS).filter({ hasText: RFC_SENTENCE });
		await expect(row).toHaveCount(1);
		await expect(row.locator('.sc-level')).toHaveText('SHOULD');
		await expect(row).toContainText('5.6.3');
		await expect(row).toContainText('Whitespace');
		await expect(row.locator('.sc-id')).toHaveText('5.6.3-2');
		await expect(row.locator('.sc-link')).toHaveAttribute('href', `${RFC_URL}#section-5.6.3-2`);

		// rfc-editor.org sends no policy at all. Nothing but the page and jsDelivr was requested.
		expect(await run.cspViolations()).toEqual([]);
		expect(run.requests.filter((entry) => !entry.startsWith('cdn.jsdelivr.net/') && !entry.startsWith('www.rfc-editor.org/'))).toEqual([]);
	});

	test('EUR-Lex: paragraphs with "shall", by article, with a reading-aid notice', async ({ page }) => {
		const run = await serveSpec(page, 'eurlex');
		await page.goto(EURLEX_URL);
		await clickBookmarklet(page);

		await expect(page.locator('.agentlet-panel-body')).toContainText('reading aid, not legal advice');
		expect(await idsOf(page)).toEqual(['Art. 1(3)', 'Art. 5(1)', 'Art. 5(2)', 'Art. 99(1)', 'Art. 99(2)']);
		expect(new Set(await levelsOf(page))).toEqual(new Set(['Shall']));
		const five = page.locator(ROWS).filter({ hasText: 'Art. 5(1)' });
		await expect(five).toContainText('Principles relating to processing of personal data');
		await expect(five).toContainText('Personal data shall be:');
		await expect(five.locator('.sc-link')).toHaveAttribute('href', `${EURLEX_URL}#005.001`);
		expect(await run.cspViolations()).toEqual([]);
	});

	test('on a page without requirements it says so', async ({ page }) => {
		const url = 'https://www.rfc-editor.org/rfc/rfc1.html';
		await serveKnownSitesPage(page, { html: '<!doctype html><title>Empty</title><h1>Empty</h1><p>Nothing normative here.</p>', url });
		await page.goto(url);
		await clickBookmarklet(page);
		await expect(page.getByText('No requirements found on this page.')).toBeVisible();
	});
});

test.describe('Spec to checklist: the panel', () => {
	test('filters by level and by text', async ({ page }) => {
		await serveSpec(page, 'w3c');
		await page.goto(W3C_TR_URL);
		await clickBookmarklet(page);
		await expect(page.locator('.ks-stats')).toContainText('4 of 4 shown');

		await page.getByLabel('Filter by level').selectOption('MUST');
		await expect(page.locator(ROWS)).toHaveCount(2);
		await expect(page.locator('.ks-stats')).toContainText('2 of 4 shown');

		await page.getByLabel('Search requirements').fill('idle');
		await expect(page.locator(ROWS)).toHaveCount(0);
		await expect(page.getByText('No requirement matches these filters.')).toBeVisible();

		await page.getByLabel('Filter by level').selectOption('');
		await expect(page.locator(ROWS)).toHaveCount(1);
		await expect(page.locator(ROWS)).toContainText('close an idle connection');
	});

	test('status and notes persist across a reload, per document', async ({ page }) => {
		await serveSpec(page, 'rfc');
		await page.goto(RFC_URL);
		await clickBookmarklet(page);
		const row = page.locator(ROWS).filter({ hasText: RFC_SENTENCE });
		await row.getByLabel('Status of 5.6.3-2').selectOption('partial');
		await row.getByLabel('Note for 5.6.3-2').fill('Single space, except in filters');
		await expect(page.locator('.ks-stats')).toContainText('1 partial');

		await page.reload();
		await clickBookmarklet(page);
		const again = page.locator(ROWS).filter({ hasText: RFC_SENTENCE });
		await expect(again.getByLabel('Status of 5.6.3-2')).toHaveValue('partial');
		await expect(again.getByLabel('Note for 5.6.3-2')).toHaveValue('Single space, except in filters');
		await expect(page.locator('.ks-stats')).toContainText('1 partial');

		const stored = await page.evaluate(() =>
			Object.keys(window.localStorage)
				.filter((key) => key.startsWith('agentlet-spec-checklist:'))
				.map((key) => [key, window.localStorage.getItem(key)]),
		);
		expect(stored).toHaveLength(1);
		expect(stored[0][0]).toBe(`agentlet-spec-checklist:${RFC_URL}`);
		expect(JSON.parse(stored[0][1] as string)).toEqual({ '5.6.3-2': { status: 'partial', note: 'Single space, except in filters' } });
	});

	test('still works when the browser refuses to store (quota or privacy mode)', async ({ page }) => {
		await page.addInitScript(() => {
			const original = Storage.prototype.setItem;
			Storage.prototype.setItem = function (key: string, value: string) {
				if (key.startsWith('agentlet-spec-checklist:')) throw new DOMException('full', 'QuotaExceededError');
				return original.call(this, key, value);
			};
		});
		await serveSpec(page, 'w3c');
		await page.goto(W3C_TR_URL);
		await clickBookmarklet(page);
		await expect(page.locator(ROWS)).toHaveCount(4);
		await expect(page.getByText('Your browser blocked local storage')).toBeHidden();
		await page.locator(ROWS).first().getByLabel('Status of 2.1a').selectOption('compliant');
		await expect(page.getByText('Your browser blocked local storage')).toBeVisible();
		await expect(page.locator('.ks-stats')).toContainText('1 compliant');
	});

	test('clicking a row scrolls to the passage and highlights it, and closing removes the highlight', async ({ page }) => {
		const run = await serveSpec(page, 'rfc');
		await page.goto(RFC_URL);
		await clickBookmarklet(page);
		const row = page.locator(ROWS).filter({ hasText: RFC_SENTENCE });
		await row.locator('.sc-text').click();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
		await expect(page.locator('[id="section-5.6.3-2"]')).toBeInViewport();
		await expect(row).toHaveAttribute('data-active', 'true');

		await page.evaluate(() => (window as unknown as { agentlet: { cleanup(): Promise<void> } }).agentlet.cleanup());
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		expect(await run.cspViolations()).toEqual([]);
	});

	test('exports the checklist to Excel with status and notes, named after the document', async ({ page }) => {
		await serveSpec(page, 'w3c');
		await page.goto(W3C_TR_URL);
		await clickBookmarklet(page);
		await page.locator(ROWS).first().getByLabel('Status of 2.1a').selectOption('non-compliant');
		await page.locator(ROWS).first().getByLabel('Note for 2.1a').fill('Missing identifier');

		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		expect(download.suggestedFilename()).toBe('example-widget-protocol-checklist.xlsx');
		const book = await readWorkbook(download);
		expect(book.SheetNames).toEqual(['Checklist']);
		const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Checklist, { header: 1 });
		expect(rows[0]).toEqual(['ID', 'Section', 'Title', 'Level', 'Requirement', 'Link', 'Status', 'Notes']);
		expect(rows).toHaveLength(5);
		expect(rows[1]).toEqual([
			'2.1a',
			'2.1',
			'Clients',
			'MUST',
			'A client MUST send a widget identifier.',
			`${W3C_TR_URL}#client-rules`,
			'Not compliant',
			'Missing identifier',
		]);
		expect(rows[2][6]).toBe('To review');

		// A filtered list exports only what it shows.
		await page.getByLabel('Filter by level').selectOption('MAY');
		const [filtered] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		const filteredBook = await readWorkbook(filtered);
		expect(XLSX.utils.sheet_to_json<string[]>(filteredBook.Sheets.Checklist, { header: 1 })).toHaveLength(2);
	});

	test('with hundreds of requirements the list is capped and says so, and an export covers them all', async ({ page }) => {
		await serveSpec(page, 'rfc');
		await page.goto(RFC_URL);
		// Add 300 invented requirement paragraphs to the page before the demo reads it.
		await page.evaluate(() => {
			const section = document.createElement('section');
			section.id = 'section-99';
			section.innerHTML =
				'<h2 id="name-bulk"><a class="section-number">99. </a><a class="section-name">Bulk</a></h2>' +
				Array.from({ length: 300 }, (_, index) => `<p id="section-99-${index + 1}">Item ${index + 1} MUST be checked.</p>`).join('');
			document.getElementById('content')?.prepend(section);
		});
		await clickBookmarklet(page);
		await expect(page.locator(ROWS)).toHaveCount(200);
		await expect(page.locator('[data-role="more"]')).toContainText('The list shows the first 200 of ');

		const total = Number((await page.locator('[data-role="shown-count"]').innerText()).trim());
		expect(total).toBeGreaterThan(300);
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		const book = await readWorkbook(download);
		expect(XLSX.utils.sheet_to_json<string[]>(book.Sheets.Checklist, { header: 1 })).toHaveLength(total + 1);
	});
});
