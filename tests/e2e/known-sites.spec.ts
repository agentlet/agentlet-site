import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import {
	clickBookmarklet,
	CORE_VERSION,
	DEMOS_VERSION,
	HN_URL,
	OTHER_SITE_URL,
	serveHackerNews,
	serveHackerNewsWithItsPolicy,
	serveKnownSitesPage,
	serveWikipedia,
	WIKIPEDIA_URL,
} from './known-sites-helpers';

/**
 * The known-sites demos (src/agentlets/known-sites/), distributed as the
 * `agentlet-demos` npm package through jsDelivr. Nothing here touches a real
 * third-party site: fixtures are served as if from those sites, Wikipedia's
 * own Content-Security-Policy header included, and the jsDelivr URLs are
 * answered from the locally built package (see known-sites-helpers.ts).
 * `npm run test:e2e` builds the package first (see the `pretest:e2e` script).
 */

const PANEL_TITLE = '#agentlet-app-name';

async function panelText(page: Page): Promise<string> {
	return (await page.locator('#agentlet-container').innerText()).replace(/\s+/g, ' ');
}

async function readWorkbook(download: import('@playwright/test').Download): Promise<XLSX.WorkBook> {
	const path = await download.path();
	expect(path).toBeTruthy();
	return XLSX.read(readFileSync(path as string), { type: 'buffer' });
}

test.describe('Known-sites page', () => {
	test('offers the jsDelivr bookmarklet, lists the sites and says what is blocked', async ({ page }) => {
		await page.goto('/try/known-sites/');
		const href = await page.locator('#known-sites-link').getAttribute('href');
		// Not served by `npm run dev`, so it points at the package on jsDelivr, by major range.
		expect(href).toContain('https://cdn.jsdelivr.net/npm/agentlet-demos@1/dist/loader.js');
		expect(href).toMatch(/^javascript:/);

		const main = page.locator('main');
		await expect(main.getByRole('heading', { name: 'Wikipedia' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'Hacker News' })).toBeVisible();
		await expect(main).toContainText('Tables to spreadsheet');
		await expect(main).toContainText('Date timeline');
		await expect(main).toContainText('Thread navigator');
		await expect(main).toContainText('Blocked today.');
		await expect(main).toContainText('GitHub, MDN, Stack Overflow and YouTube');
		await expect(main).toContainText('Nothing is sent anywhere');
		await expect(main.getByRole('link', { name: 'Apollo 11 on English Wikipedia' })).toHaveAttribute(
			'href',
			'https://en.wikipedia.org/wiki/Apollo_11',
		);
		await expect(main.getByRole('link', { name: /how the known-site demos are built/ })).toHaveAttribute('href', '/docs/guides/known-sites/');
	});

	test('the on-site bookmarklet page links to it, and the docs page exists', async ({ page }) => {
		await page.goto('/try/bookmarklet/');
		await page.getByRole('link', { name: 'the known-sites page' }).click();
		await expect(page).toHaveURL(/\/try\/known-sites\/$/);
		await page.goto('/docs/guides/known-sites/');
		await expect(page.getByRole('heading', { name: 'Known-site demos', level: 1 })).toBeVisible();
	});
});

test.describe('Known-sites bookmarklet loader', () => {
	test('loads under the real Wikipedia policy, pins exact versions, and reaches no other host', async ({ page }) => {
		const run = await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await clickBookmarklet(page);

		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.locator(PANEL_TITLE)).toHaveText('Agentlet demos');
		await expect(page.getByText('Demos for Wikipedia')).toBeVisible();
		await expect(page.getByText('Tables to spreadsheet')).toBeVisible();
		await expect(page.getByText('Date timeline')).toBeVisible();

		expect(await run.cspViolations()).toEqual([]);

		const external = run.requests.filter((entry) => !entry.startsWith('en.wikipedia.org/'));
		// The bookmarklet uses the major range; every later request names an exact version.
		expect(external[0]).toBe('cdn.jsdelivr.net/npm/agentlet-demos@1/dist/loader.js');
		for (const entry of external.slice(1)) {
			expect(entry).toMatch(
				new RegExp(`^cdn\\.jsdelivr\\.net/npm/(agentlet-demos@${DEMOS_VERSION}|agentlet-core@${CORE_VERSION})/dist/`),
			);
		}
		expect(external.some((entry) => entry.includes(`agentlet-core@${CORE_VERSION}/dist/agentlet-core.min.js`))).toBe(true);
		expect(external.some((entry) => entry.includes(`agentlet-demos@${DEMOS_VERSION}/dist/registry.js`))).toBe(true);
		expect(external.some((entry) => entry.includes('agentlets/wikipedia-'))).toBe(false); // demos are lazy
	});

	test('a second click does not start a second panel', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await clickBookmarklet(page);
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await clickBookmarklet(page);
		await expect(page.locator('#agentlet-container')).toHaveCount(1);
	});

	test('on an unsupported site it lists the supported sites', async ({ page }) => {
		await serveKnownSitesPage(page, { html: '<!doctype html><title>Example</title><h1>Example</h1>', url: OTHER_SITE_URL });
		await page.goto(OTHER_SITE_URL);
		await clickBookmarklet(page);

		await expect(page.locator(PANEL_TITLE)).toHaveText('Agentlet demos');
		await expect(page.getByText('No demo for this page')).toBeVisible();
		const text = await panelText(page);
		expect(text).toContain('Wikipedia');
		expect(text).toContain('Hacker News');
		await expect(page.getByRole('link', { name: 'Apollo 11 on English Wikipedia' })).toBeVisible();
	});
});

test.describe('Wikipedia: tables to spreadsheet', () => {
	test('previews the infobox and every table, and exports them', async ({ page }) => {
		const run = await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await clickBookmarklet(page);
		await page.getByRole('button', { name: 'Try it' }).first().click();
		await expect(page.locator(PANEL_TITLE)).toHaveText('Tables to spreadsheet');

		// The fixture has one infobox and four wikitables.
		await expect(page.locator('.wt-card')).toHaveCount(5);
		await expect(page.locator('.wt-card').first()).toContainText('Infobox');
		await expect(page.locator('.wt-card').first().locator('.wt-preview')).toContainText('Mission type');
		await expect(page.locator('.wt-card').nth(3)).toContainText('Apollo 11 flight directors');
		// Citation markers and hidden sort keys are not part of the cell text.
		expect(await panelText(page)).not.toMatch(/\[\d+\]/);

		// "Show on page" highlights the table and scrolls to it.
		await page.locator('.wt-card').nth(3).getByRole('button', { name: 'Show on page' }).click();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
		await expect(page.locator('table.wikitable').nth(2)).toBeInViewport();

		// One table: a single-sheet file through the core's download().
		const [single] = await Promise.all([
			page.waitForEvent('download'),
			page.locator('.wt-card').nth(3).getByRole('button', { name: 'Export', exact: true }).click(),
		]);
		expect(single.suggestedFilename()).toMatch(/^apollo-11-.+\.xlsx$/);
		const singleBook = await readWorkbook(single);
		expect(singleBook.SheetNames).toHaveLength(1);
		const flightRows = XLSX.utils.sheet_to_json<string[]>(singleBook.Sheets[singleBook.SheetNames[0]], { header: 1 });
		expect(flightRows).toHaveLength(6);
		expect(flightRows[0]).toHaveLength(4);
		expect(flightRows.flat().join(' ')).not.toMatch(/\[\d+\]/);

		// All tables: one workbook, one sheet per table, names unique.
		const [all] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: /Export all 5 to one Excel file/ }).click(),
		]);
		expect(all.suggestedFilename()).toBe('apollo-11-tables.xlsx');
		const book = await readWorkbook(all);
		expect(book.SheetNames).toHaveLength(5);
		expect(new Set(book.SheetNames.map((name) => name.toLowerCase())).size).toBe(5);
		expect(book.SheetNames[0]).toBe('Infobox');
		const infobox = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Infobox, { header: 1 });
		expect(infobox[0]).toEqual(['Field', 'Value']);
		const flat = infobox.map((row) => row.join('|'));
		expect(flat.some((row) => row.startsWith('Mission type|Crewed lunar landing'))).toBe(true);

		expect(await run.cspViolations()).toEqual([]);
	});

	test('closing the panel leaves the article untouched', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		const before = await page.locator('#mw-content-text').innerHTML();
		await clickBookmarklet(page);
		await page.getByRole('button', { name: 'Try it' }).first().click();
		await page.locator('.wt-card').nth(1).getByRole('button', { name: 'Show on page' }).click();
		await page.locator('#agentlet-container').waitFor();
		await page.evaluate(() => (window as unknown as { agentlet: { cleanup(): Promise<void> } }).agentlet.cleanup());
		await expect(page.locator('#agentlet-container')).toHaveCount(0);
		expect(await page.locator('#mw-content-text').innerHTML()).toBe(before);
	});
});

test.describe('Wikipedia: date timeline', () => {
	test('lists dates chronologically and scrolls to the passage', async ({ page }) => {
		const run = await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		// Bare years need a hint ("in 1967", "(1968)"); counts and codes are not years.
		await page.evaluate(() => {
			const paragraph = document.createElement('p');
			paragraph.textContent = 'The crew trained in 1967 and again (1968). The rocket weighed 1500 kg and the code was 1201.';
			document.querySelector('.mw-parser-output')?.prepend(paragraph); // before the end matter, which is not scanned
		});
		await clickBookmarklet(page);
		await page.getByRole('button', { name: 'Try it' }).nth(1).click();
		await expect(page.locator(PANEL_TITLE)).toHaveText('Date timeline');

		const entries = page.locator('.dt-entry');
		await expect(entries.first()).toBeVisible();
		const count = await entries.count();
		expect(count).toBeGreaterThan(5);
		// Every date found is marked on the page.
		await expect(page.locator('mark.agentlet-date-mark')).toHaveCount(count);

		// Chronological: keys never decrease.
		const keys = await entries.evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.key)));
		expect(keys.every((key, index) => index === 0 || key >= keys[index - 1])).toBe(true);

		// A full date from the lead text is recognised.
		const labels = await entries.locator('.dt-entry-date').allTextContents();
		expect(labels).toContain('October 4, 1957');
		expect(labels).toContain('May 1961');
		expect(labels).toContain('1967');
		expect(labels).toContain('1968');
		expect(labels).not.toContain('1500');
		expect(labels).not.toContain('1201');

		// Dates in the infobox, tables and references are not read.
		const inSkipped = await page.evaluate(
			() => document.querySelectorAll('table mark.agentlet-date-mark, .reflist mark.agentlet-date-mark').length,
		);
		expect(inSkipped).toBe(0);

		// Clicking an entry scrolls to it and highlights it.
		const target = entries.nth(count - 1);
		const label = (await target.locator('.dt-entry-date').innerText()).trim();
		await target.click();
		const active = page.locator('mark.agentlet-date-mark-active');
		await expect(active).toHaveCount(1);
		await expect(active).toHaveText(label);
		await expect(active).toBeInViewport();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);

		// "Full dates only" hides bare years.
		await page.getByLabel(/Full dates only/).check();
		const fullOnly = await page.locator('.dt-entry').count();
		expect(fullOnly).toBeLessThan(count);
		expect(fullOnly).toBeGreaterThan(0);

		expect(await run.cspViolations()).toEqual([]);
	});

	test('closing the panel removes every mark', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		const before = await page.locator('#mw-content-text').innerHTML();
		await clickBookmarklet(page);
		await page.getByRole('button', { name: 'Try it' }).nth(1).click();
		await expect(page.locator('mark.agentlet-date-mark').first()).toBeVisible();
		await page.evaluate(() => (window as unknown as { agentlet: { cleanup(): Promise<void> } }).agentlet.cleanup());
		await expect(page.locator('mark.agentlet-date-mark')).toHaveCount(0);
		expect(await page.locator('#mw-content-text').innerHTML()).toBe(before);
	});
});

test.describe('Hacker News: thread navigator', () => {
	// A record of a limit, not a feature: with the Content-Security-Policy
	// Hacker News sends (checked 2026-09-30, tests/e2e/fixtures/known-sites/
	// hacker-news-csp.txt), the page allows scripts only from itself, Google
	// reCAPTCHA and cdnjs, so the bookmarklet's script from jsDelivr is
	// refused. /try/known-sites/ says so. If this test starts failing because
	// the policy in the fixture was refreshed and now allows jsDelivr, update
	// that page, the docs and the `status` of the site in
	// src/agentlets/known-sites/manifest.ts.
	test('the real site policy blocks the bookmarklet, as the docs say', async ({ page }) => {
		const run = await serveHackerNewsWithItsPolicy(page);
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect.poll(async () => (await run.cspViolations()).join(' ')).toContain('cdn.jsdelivr.net');
		await expect(page.locator('#agentlet-container')).toHaveCount(0);
	});

	test('opens directly, moves with j and k, collapses, and marks the story author', async ({ page }) => {
		const run = await serveHackerNews(page);
		await page.goto(HN_URL);
		await clickBookmarklet(page);

		// A single demo for this page opens without going through the launcher.
		await expect(page.locator(PANEL_TITLE)).toHaveText('Thread navigator');
		await expect(page.locator('.ks-stats')).toContainText('7 comments');
		await expect(page.locator('.ks-stats')).toContainText('4 top-level');

		// The story author's comments are marked, at any depth.
		await expect(page.locator('tr.comtr[data-agentlet-op]')).toHaveCount(2);
		await expect(page.locator('[id="9000102"]')).toHaveAttribute('data-agentlet-op', '');
		await expect(page.locator('[id="9000107"]')).toHaveAttribute('data-agentlet-op', '');

		// j and k move between top-level comments only.
		const current = page.locator('tr.comtr[data-agentlet-current]');
		await expect(current).toHaveCount(0);
		await page.keyboard.press('j');
		await expect(current).toHaveAttribute('id', '9000101');
		await page.keyboard.press('j');
		await expect(current).toHaveAttribute('id', '9000104');
		await page.keyboard.press('j');
		await expect(current).toHaveAttribute('id', '9000105');
		await page.keyboard.press('k');
		await expect(current).toHaveAttribute('id', '9000104');
		await expect(current).toBeInViewport();
		await expect(page.getByText('Comment 2 of 4')).toBeVisible();
		// Stops at the ends instead of wrapping.
		await page.keyboard.press('k');
		await page.keyboard.press('k');
		await expect(current).toHaveAttribute('id', '9000101');

		// Collapse all hides every reply and the body of each top-level comment.
		await page.getByRole('button', { name: 'Collapse all' }).click();
		await expect(page.locator('[id="9000102"]')).toBeHidden();
		await expect(page.locator('[id="9000103"]')).toBeHidden();
		await expect(page.locator('[id="9000106"]')).toBeHidden();
		await expect(page.locator('[id="9000101"] .comment')).toBeHidden();
		await expect(page.locator('[id="9000101"]')).toBeVisible();
		await expect(page.locator('.ks-stats')).toContainText('4 collapsed');

		await page.getByRole('button', { name: 'Expand all' }).click();
		await expect(page.locator('[id="9000102"]')).toBeVisible();
		await expect(page.locator('[id="9000101"] .comment')).toBeVisible();
		await expect(page.locator('.ks-stats')).toContainText('0 collapsed');

		// "c" collapses the current thread only.
		await page.keyboard.press('c');
		await expect(page.locator('[id="9000102"]')).toBeHidden();
		await expect(page.locator('[id="9000106"]')).toBeVisible();

		// Nothing was posted: the only requests are the fixture page and jsDelivr.
		// (The fixture's own images are answered empty; they are not part of this check.)
		const other = run.requests.filter(
			(entry) => !entry.startsWith('cdn.jsdelivr.net/') && !entry.startsWith('news.ycombinator.com/item') && !/\.(svg|gif)$/.test(entry),
		);
		expect(other).toEqual([]);
		expect(await run.cspViolations()).toEqual([]);
	});

	test('shortcuts do not fire while typing in a field', async ({ page }) => {
		await serveHackerNews(page);
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect(page.locator(PANEL_TITLE)).toHaveText('Thread navigator');
		await page.locator('textarea[name="text"]').focus();
		await page.keyboard.type('jjj');
		await expect(page.locator('tr.comtr[data-agentlet-current]')).toHaveCount(0);
		await expect(page.locator('textarea[name="text"]')).toHaveValue('jjj');
	});

	test('marks comments that are new since the last visit, keyed by item id', async ({ page }) => {
		// First visit: nothing to compare with yet.
		await serveHackerNews(page, false);
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect(page.getByText(/First visit to this thread/)).toBeVisible();
		await expect(page.locator('tr.comtr[data-agentlet-new]')).toHaveCount(0);
		const stored = await page.evaluate(() => Object.keys(localStorage));
		expect(stored).toEqual(['agentlet-demos:hn-seen:9000001']);

		// Second visit: two comments were added in the meantime.
		await page.unrouteAll({ behavior: 'ignoreErrors' });
		await serveHackerNews(page, true);
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect(page.locator('tr.comtr[data-agentlet-new]')).toHaveCount(2);
		await expect(page.locator('[id="9000108"]')).toHaveAttribute('data-agentlet-new', '');
		await expect(page.locator('[id="9000109"]')).toHaveAttribute('data-agentlet-new', '');
		await expect(page.locator('[data-role="new-count"]')).toHaveText('2');

		// Third visit: everything was seen on the second one.
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect(page.locator('tr.comtr[data-agentlet-new]')).toHaveCount(0);
		await expect(page.locator('[data-role="new-count"]')).toHaveText('0');
	});

	test('still works when storage is blocked', async ({ page }) => {
		await serveHackerNews(page);
		// A full or blocked store: writing this demo's own key throws.
		await page.addInitScript(() => {
			const original = Storage.prototype.setItem;
			Storage.prototype.setItem = function (key: string, value: string) {
				if (key.startsWith('agentlet-demos:')) throw new DOMException('quota', 'QuotaExceededError');
				return original.call(this, key, value);
			};
		});
		await page.goto(HN_URL);
		await clickBookmarklet(page);
		await expect(page.locator(PANEL_TITLE)).toHaveText('Thread navigator');
		await expect(page.getByText(/blocked storage/)).toBeVisible();
		await page.keyboard.press('j');
		await expect(page.locator('tr.comtr[data-agentlet-current]')).toHaveAttribute('id', '9000101');
	});
});
