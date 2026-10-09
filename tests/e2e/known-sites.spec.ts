import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';
import {
	ARXIV_ABS_URL,
	ARXIV_LIST_URL,
	ARXIV_SEARCH_URL,
	clickBookmarklet,
	CORE_VERSION,
	DEMOS_VERSION,
	OTHER_SITE_URL,
	serveArxiv,
	heading2,
	serveKnownSitesPage,
	serveWikipedia,
	serveWikipediaArticle,
	WIKIPEDIA_URL,
} from './known-sites-helpers';

/**
 * The known-sites demos (src/agentlets/known-sites/), distributed as the
 * `@agentlet/demos` npm package through jsDelivr. Nothing here touches a real
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
	test('offers the jsDelivr bookmarklet, lists the sites and states the limits', async ({ page }) => {
		await page.goto('/try/known-sites/');
		const href = await page.locator('#known-sites-link').getAttribute('href');
		// Not served by `npm run dev`, so it points at the package on jsDelivr, by major range.
		expect(href).toContain('https://cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js');
		expect(href).toMatch(/^javascript:/);
		// The date is computed when the bookmarklet is clicked, not when the page is built.
		expect(href).toContain("loader.js?d='+new Date().toISOString()");
		await expect(page.getByText('Added it before 2 October 2026?')).toBeVisible();

		const main = page.locator('main');
		await expect(main.getByRole('heading', { name: 'Wikipedia' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'arXiv' })).toBeVisible();
		await expect(main.getByRole('heading', { name: 'Standards and regulations (W3C, RFC Editor, EUR-Lex)' })).toBeVisible();
		await expect(main).toContainText('Spec to checklist');
		await expect(main.getByRole('link', { name: 'WCAG 2.2 on W3C' })).toHaveAttribute('href', 'https://www.w3.org/TR/WCAG22/');
		await expect(main.getByRole('link', { name: 'RFC 9110 (HTTP Semantics) on RFC Editor' })).toHaveAttribute(
			'href',
			'https://www.rfc-editor.org/rfc/rfc9110.html',
		);
		await expect(main.getByRole('link', { name: 'The GDPR on EUR-Lex' })).toHaveAttribute(
			'href',
			'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
		);
		await expect(main).toContainText('Tables to spreadsheet');
		await expect(main).toContainText('Date timeline');
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
		// The loader URL carries today's UTC date, so a browser refetches it at most once a day.
		const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		expect(external[0]).toBe(`cdn.jsdelivr.net/npm/@agentlet/demos@1/dist/loader.js?d=${today}`);
		for (const entry of external.slice(1)) {
			expect(entry).not.toContain('?');
			expect(entry).toMatch(
				new RegExp(`^cdn\\.jsdelivr\\.net/npm/(@agentlet/demos@${DEMOS_VERSION}|agentlet-core@${CORE_VERSION})/dist/`),
			);
		}
		expect(external.some((entry) => entry.includes(`agentlet-core@${CORE_VERSION}/dist/agentlet-core.min.js`))).toBe(true);
		expect(external.some((entry) => entry.includes(`@agentlet/demos@${DEMOS_VERSION}/dist/registry.js`))).toBe(true);
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
		expect(text).toContain('arXiv');
		expect(text).toContain('Standards and regulations (W3C, RFC Editor, EUR-Lex)');
		expect(text).toContain('Spec to checklist');
		await expect(page.getByRole('link', { name: 'Apollo 11 on English Wikipedia' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'WCAG 2.2 on W3C' })).toBeVisible();
		await expect(page.getByRole('link', { name: 'The GDPR on EUR-Lex' })).toBeVisible();
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

/** Opens the Date timeline demo on the current page. */
async function openDateTimeline(page: Page): Promise<void> {
	await clickBookmarklet(page);
	await page.getByRole('button', { name: 'Try it' }).nth(1).click();
	await expect(page.locator(PANEL_TITLE)).toHaveText('Date timeline');
	await expect(page.locator('.dt-entry').first()).toBeVisible();
}

/** Opens the timeline view from the panel and waits for the chart. */
async function openTimelineView(page: Page): Promise<void> {
	await openDateTimeline(page);
	await page.getByRole('button', { name: 'Open timeline view' }).click();
	await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible();
	await expect(page.locator('.tl-svg')).toBeVisible();
}

async function tickLabels(page: Page): Promise<string[]> {
	return (await page.locator('.tl-tick-label').allTextContents()).map((text) => text.trim());
}

/** The cell text of each row of the first sheet of a download. */
async function sheetRows(download: import('@playwright/test').Download): Promise<string[][]> {
	const book = await readWorkbook(download);
	return XLSX.utils.sheet_to_json<string[]>(book.Sheets[book.SheetNames[0]], { header: 1 });
}

test.describe('Wikipedia: timeline view', () => {
	test('opens with an axis, density bars, points and a legend of the sections', async ({ page }) => {
		const run = await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openDateTimeline(page);
		const keys = await page.locator('.dt-entry').evaluateAll((nodes) => nodes.map((node) => Number((node as HTMLElement).dataset.key)));
		const mentions = keys.length;
		const dates = new Set(keys).size;
		const fullDates = new Set(keys.filter((key) => key % 100 !== 0)).size;

		await page.getByRole('button', { name: 'Open timeline view' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible();
		await expect(page.locator('.agentlet-fullscreen-header')).toContainText('Timeline view: Apollo 11');

		// The axis fits the dates found: the 1957 to 1969 span gets year ticks.
		await expect(page.locator('.tl-axis-line')).toHaveCount(1);
		const labels = await tickLabels(page);
		expect(labels.length).toBeGreaterThan(3);
		expect(labels.every((label) => /^\d{4}$/.test(label))).toBe(true);
		expect(Number(labels[0])).toBeGreaterThanOrEqual(1955);
		expect(Number(labels[labels.length - 1])).toBeLessThanOrEqual(1970);

		// The density strip counts every mention.
		const bars = page.locator('.tl-bar');
		expect(await bars.count()).toBeGreaterThan(0);
		const counted = await bars.evaluateAll((nodes) =>
			nodes.reduce((sum, node) => sum + Number(/(\d+) mention/.exec(node.getAttribute('aria-label') ?? '')?.[1]), 0),
		);
		expect(counted).toBe(mentions);

		// Same dates collapse into one point; a full date is filled, the others are hollow.
		await expect(page.locator('.tl-point')).toHaveCount(dates);
		await expect(page.locator('.tl-point.tl-day')).toHaveCount(fullDates);
		await expect(page.locator('.tl-point.tl-day .tl-dot')).toHaveCount(fullDates);
		await expect(page.locator('.tl-point:not(.tl-day) .tl-ring')).toHaveCount(dates - fullDates);

		// Points are labelled with date, precision, count and section.
		await expect(page.locator('.tl-point').first()).toHaveAttribute(
			'aria-label',
			'October 4, 1957, full date, 1 mention, section Background',
		);

		// The legend lists the sections that hold dates, with their counts, and says how precision is drawn.
		const legend = page.locator('.tl-legend');
		await expect(legend).toContainText('Introduction');
		await expect(legend).toContainText('Background');
		await expect(legend).toContainText('Celebrations');
		await expect(page.locator('.tl-legend-precision')).toContainText('Full date');
		await expect(page.locator('.tl-legend-precision')).toContainText('Month and year, or year only');

		// The list below is the plain fallback: one button per mention.
		await expect(page.locator('.tl-item')).toHaveCount(mentions);

		expect(await run.cspViolations()).toEqual([]);
	});

	test('hover and focus show the sentence in a tooltip', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const tooltip = page.locator('.tl-tooltip');
		await expect(tooltip).toBeHidden();

		const point = page.locator('.tl-point[aria-label^="October 4, 1957"]');
		await point.hover();
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('October 4, 1957');
		await expect(tooltip).toContainText('Full date in Background');
		await expect(tooltip).toContainText('the Soviet Union launched');
		await page.mouse.move(2, 2);
		await expect(tooltip).toBeHidden();

		await page.locator('.tl-point[aria-label^="January 1967"]').focus();
		await expect(tooltip).toBeVisible();
		await expect(tooltip).toContainText('Month and year in Introduction');
	});

	test('clicking a bar filters the list, clicking it again or Show all clears it', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const items = page.locator('.tl-item');
		const total = await items.count();
		const showAll = page.getByRole('button', { name: 'Show all' });
		await expect(showAll).toHaveAttribute('aria-disabled', 'true');

		// Pick a bar that does not hold every mention.
		const bar = page.locator('.tl-bar').first();
		const label = (await bar.getAttribute('aria-label')) ?? '';
		const inBar = Number(/(\d+) mention/.exec(label)?.[1]);
		expect(inBar).toBeLessThan(total);
		await bar.click();
		await expect(items).toHaveCount(inBar);
		await expect(bar).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator('.tl-status')).toContainText(`${inBar} of ${total} mentions`);
		await expect(showAll).toHaveAttribute('aria-disabled', 'false');
		// The points outside the bucket are dimmed, the ones inside are not.
		expect(await page.locator('.tl-point:not(.tl-dim)').count()).toBeGreaterThan(0);
		expect(await page.locator('.tl-point.tl-dim').count()).toBeGreaterThan(0);

		// Again: cleared.
		await bar.click();
		await expect(items).toHaveCount(total);
		await expect(bar).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator('.tl-point.tl-dim')).toHaveCount(0);

		// Show all clears it too, and a bar works from the keyboard.
		await bar.focus();
		await page.keyboard.press('Enter');
		await expect(items).toHaveCount(inBar);
		await showAll.click();
		await expect(items).toHaveCount(total);
		await expect(bar).toHaveAttribute('aria-pressed', 'false');
	});

	test('clicking a point closes the view, scrolls to the passage and highlights it', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await page.locator('.tl-point[aria-label^="August 13, 1969"]').click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
		const active = page.locator('mark.agentlet-date-mark-active');
		await expect(active).toHaveCount(1);
		await expect(active).toHaveText('August 13, 1969');
		await expect(active).toBeInViewport();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
	});

	test('a list row does the same', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await page.locator('.tl-item', { hasText: 'May 5, 1961' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
		await expect(page.locator('mark.agentlet-date-mark-active')).toHaveText('May 5, 1961');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
	});

	test('works from the keyboard: arrow keys move between points, Enter chooses, Escape closes', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);

		// One tab stop for the points, and arrow keys move inside the group.
		await expect(page.locator('.tl-point[tabindex="0"]')).toHaveCount(1);
		await page.locator('.tl-point').first().focus();
		await page.keyboard.press('ArrowRight');
		const second = await page.locator('.tl-point').nth(1).getAttribute('aria-label');
		expect(await page.evaluate(() => document.getElementById('agentlet-host')?.shadowRoot?.activeElement?.getAttribute('aria-label'))).toBe(second);
		await expect(page.locator('.tl-point[tabindex="0"]')).toHaveCount(1);
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
		await expect(page.locator('mark.agentlet-date-mark-active')).toHaveText('August 13, 1969');

		// Escape closes the view without choosing anything, and focus goes back to the panel button.
		await page.getByRole('button', { name: 'Open timeline view' }).click();
		await expect(page.locator('.tl-svg')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Open timeline view' })).toBeFocused();
	});

	test('exports the timeline to Excel', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const mentions = await page.locator('.tl-item').count();
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		expect(download.suggestedFilename()).toBe('apollo-11-timeline.xlsx');
		const rows = await sheetRows(download);
		expect(rows[0]).toEqual(['Date', 'Precision', 'Section', 'Sentence']);
		expect(rows).toHaveLength(mentions + 1);
		// Chronological, ISO dates, readable precision, the section and the sentence.
		expect(rows[1].slice(0, 3)).toEqual(['1957-10-04', 'Full date', 'Background']);
		expect(rows[1][3]).toContain('the Soviet Union launched');
		const dates = rows.slice(1).map((row) => row[0]);
		expect(dates).toContain('1961-05');
		expect(dates).toContain('1967-01');
		expect(dates[dates.length - 1]).toBe('1969-08-13');
		expect(rows.slice(1).some((row) => row[1] === 'Month and year')).toBe(true);
		// The view stays open.
		await expect(page.locator('.tl-svg')).toBeVisible();
	});

	test('follows the dark colour scheme', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const colours = await page.evaluate(() => {
			const root = document.getElementById('agentlet-host')?.shadowRoot;
			const pick = (selector: string, property: string): string => {
				const element = root?.querySelector(selector);
				return element ? getComputedStyle(element).getPropertyValue(property).trim() : '';
			};
			return {
				dialog: pick('.agentlet-fullscreen-dialog', 'background-color'),
				footer: pick('.agentlet-fullscreen-footer', 'background-color'),
				text: pick('.tl-root', 'color'),
				surface: pick('.tl-root', '--color-surface'),
				bar: pick('.tl-bar-fill', 'fill'),
				dot: pick('.tl-dot', 'fill'),
				ring: pick('.tl-ring', 'fill'),
				tick: pick('.tl-tick-label', 'fill'),
			};
		});
		expect(colours.dialog).toBe('rgb(11, 26, 38)');
		expect(colours.footer).toBe('rgb(22, 41, 58)');
		expect(colours.text).toBe('rgb(230, 237, 242)');
		expect(colours.surface).toBe('#16293a');
		// Light marks on the dark surface: the dark theme's own colours, not the light ones.
		expect(colours.bar).toBe('rgb(127, 155, 181)');
		expect(colours.ring).toBe('rgb(11, 26, 38)');
		expect(colours.tick).toBe('rgb(169, 185, 198)');
		const lightness = (rgb: string): number => {
			const [r, g, b] = (rgb.match(/\d+/g) ?? []).map(Number);
			return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		};
		expect(lightness(colours.dot)).toBeGreaterThan(0.45);
	});

	test('uses the light colours in the light scheme', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const colours = await page.evaluate(() => {
			const root = document.getElementById('agentlet-host')?.shadowRoot;
			const pick = (selector: string, property: string): string => {
				const element = root?.querySelector(selector);
				return element ? getComputedStyle(element).getPropertyValue(property).trim() : '';
			};
			return { dialog: pick('.agentlet-fullscreen-dialog', 'background-color'), bar: pick('.tl-bar-fill', 'fill'), text: pick('.tl-root', 'color') };
		});
		expect(colours.dialog).toBe('rgb(255, 255, 255)');
		expect(colours.bar).toBe('rgb(107, 129, 150)');
		expect(colours.text).toBe('rgb(61, 79, 94)');
	});

	test('closing the agentlet while the view is open removes it and every mark', async ({ page }) => {
		await serveWikipedia(page);
		await page.goto(WIKIPEDIA_URL);
		const before = await page.locator('#mw-content-text').innerHTML();
		await openTimelineView(page);
		await page.evaluate(() => (window as unknown as { agentlet: { cleanup(): Promise<void> } }).agentlet.cleanup());
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
		await expect(page.locator('mark.agentlet-date-mark')).toHaveCount(0);
		expect(await page.locator('#mw-content-text').innerHTML()).toBe(before);
	});
});

test.describe('Wikipedia: timeline view, scales and sections', () => {
	test('a single date gets a day axis and one point', async ({ page }) => {
		await serveWikipediaArticle(page, '<p>The crew landed on 20 July 1969 and stayed for a day.</p>');
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await expect(page.locator('.tl-point')).toHaveCount(1);
		await expect(page.locator('.tl-bar')).toHaveCount(1);
		const labels = await tickLabels(page);
		expect(labels.length).toBeGreaterThan(2);
		expect(labels).toContain('Jul 20, 1969');
		expect(labels.every((label) => /^[A-Z][a-z]{2} \d{1,2}, 1969$/.test(label))).toBe(true);
		await expect(page.locator('.tl-caption')).toHaveText('Mentions per day');
		// Without a heading the lead is the only section.
		await expect(page.locator('.tl-legend')).toContainText('Introduction');
		await expect(page.locator('.tl-point')).toHaveAttribute('aria-label', '20 July 1969, full date, 1 mention, section Introduction');
	});

	test('dates in one year get month ticks', async ({ page }) => {
		await serveWikipediaArticle(
			page,
			'<p>Planning began in January 1969. The launch was on July 16, 1969, and the crew returned on 24 July 1969. A review followed in December 1969.</p>',
		);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const labels = await tickLabels(page);
		expect(labels.length).toBeGreaterThan(3);
		expect(labels.every((label) => /^[A-Z][a-z]{2} 19(69|70)$/.test(label))).toBe(true);
		expect(labels).toContain('Jul 1969');
		await expect(page.locator('.tl-caption')).toHaveText(/^Mentions per (day|week|2 weeks|month)$/);
		// A month and year is hollow and spans its month.
		await expect(page.locator('.tl-point.tl-month')).toHaveCount(2);
		expect(await page.locator('.tl-point.tl-month .tl-span').count()).toBeGreaterThan(0);
	});

	test('centuries of history get a coarse axis and wide buckets', async ({ page }) => {
		await serveWikipediaArticle(
			page,
			'<p>The charter was sealed in 1215 and the voyage began in 1492. The revolution came in 1789, the republic fell in 1851 and the war ended in 1945, and the treaty was signed in 2005. The town was founded in 876 AD, on 3 May 1100.</p>',
		);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const labels = await tickLabels(page);
		expect(labels.length).toBeGreaterThan(4);
		expect(labels.length).toBeLessThan(22);
		const years = labels.map(Number);
		// Round years on one step (a multiple of 50 or more), covering the span.
		expect(years.every((year) => year % 50 === 0)).toBe(true);
		expect(years[0]).toBeLessThanOrEqual(1100);
		expect(years[years.length - 1]).toBeGreaterThanOrEqual(2000);
		const caption = (await page.locator('.tl-caption').textContent()) ?? '';
		expect(caption).toMatch(/^Mentions per (5|10|20|25|50) years$/);
		expect(await page.locator('.tl-bar').count()).toBeGreaterThan(5);
	});

	test('colours points by the nearest preceding level-2 heading', async ({ page }) => {
		await serveWikipediaArticle(
			page,
			`<p>Before the first heading, in 1801.</p>
${heading2('Early years')}<p>It began in 1850.</p><h3 id="Sub">A subsection</h3><p>Still in 1860, same section.</p>
${heading2('Later years')}<p>It ended in 1900, and again in 1900.</p>
<div id="toc"><div class="toctitle"><h2>Contents</h2></div><p>Skipped, in 1999.</p></div>
${heading2('References')}<p>Not read, in 1850.</p>`,
		);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const sections = await page.locator('.tl-legend .tl-legend-item').allTextContents();
		expect(sections.map((text) => text.replace(/\d+$/, ''))).toEqual(['Introduction', 'Early years', 'Later years']);
		await expect(page.locator('.tl-point')).toHaveCount(4);
		await expect(page.locator('.tl-point[aria-label^="1801"]')).toHaveAttribute('aria-label', /section Introduction$/);
		await expect(page.locator('.tl-point[aria-label^="1860"]')).toHaveAttribute('aria-label', /section Early years$/);
		// Two mentions of the same date collapse into one point with a count.
		const point = page.locator('.tl-point[aria-label^="1900"]');
		await expect(point).toHaveAttribute('aria-label', '1900, year only, 2 mentions, section Later years');
		await expect(point.locator('.tl-dot-count')).toHaveText('2');
		// Different sections, different colours.
		const fills = await page
			.locator('.tl-point .tl-ring')
			.evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).stroke));
		expect(new Set(fills).size).toBe(3);
	});

	test('works on another language edition', async ({ page }) => {
		await serveWikipediaArticle(
			page,
			`<p>Le 20 juillet 1969, les astronautes ont alunit.</p>${heading2('Retour')}<p>Ils sont rentres le 24 juillet 1969.</p>`,
			{ lang: 'fr', title: 'Apollo 11', url: 'https://fr.wikipedia.org/wiki/Apollo_11' },
		);
		await page.goto('https://fr.wikipedia.org/wiki/Apollo_11');
		await openTimelineView(page);
		await expect(page.locator('.tl-point')).toHaveCount(2);
		// Month names on the axis follow the page language.
		expect((await tickLabels(page)).some((label) => /juil/.test(label))).toBe(true);
		await expect(page.locator('.tl-legend')).toContainText('Introduction');
		await expect(page.locator('.tl-legend')).toContainText('Retour');
	});

	test('stays responsive with the largest number of dates', async ({ page }) => {
		const sentences: string[] = [];
		for (let i = 0; i < 700; i += 1) sentences.push(`Event ${i} took place on ${1 + (i % 28)} March ${1700 + (i % 300)}.`);
		await serveWikipediaArticle(page, `<p>${sentences.join(' ')}</p>`);
		await page.goto(WIKIPEDIA_URL);
		await openDateTimeline(page);
		await expect(page.locator('.ks-note')).toContainText('only the first 600 dates');
		const started = Date.now();
		await page.getByRole('button', { name: 'Open timeline view' }).click();
		await expect(page.locator('.tl-svg')).toBeVisible();
		await expect(page.locator('.tl-item')).toHaveCount(600);
		expect(await page.locator('.tl-point').count()).toBeGreaterThan(100);
		expect(Date.now() - started).toBeLessThan(5000);
		// Filtering and closing still work.
		await page.locator('.tl-bar').first().click();
		expect(await page.locator('.tl-item').count()).toBeLessThan(600);
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toHaveCount(0);
	});
});

/** One sentence per year, each with a bare year the date finder accepts ("noted in 1950"). */
function yearSentences(years: number[]): string {
	return `<p>${years.map((year) => `Something was noted in ${year}.`).join(' ')}</p>`;
}

function range(from: number, to: number, step = 1): number[] {
	const years: number[] = [];
	for (let year = from; year <= to; year += step) years.push(year);
	return years;
}

test.describe('Wikipedia: timeline view, main period', () => {
	test('an isolated date at the start is left off the axis and the toggle brings it back', async ({ page }) => {
		await serveWikipediaArticle(page, yearSentences([1202, ...range(1950, 1979)]));
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		const note = page.locator('.tl-range');
		await expect(note).toBeVisible();
		await expect(note).toContainText('1 date outside the main period (1202).');

		// The axis covers the main period only, and the 1202 point is not drawn.
		let years = (await tickLabels(page)).map(Number);
		expect(years[0]).toBeGreaterThanOrEqual(1945);
		expect(years[years.length - 1]).toBeLessThanOrEqual(1985);
		await expect(page.locator('.tl-point')).toHaveCount(30);
		await expect(page.locator('.tl-point[aria-label^="1202"]')).toHaveCount(0);
		// Everything else still counts it: the list, the summary, the legend.
		await expect(page.locator('.tl-item')).toHaveCount(31);
		await expect(page.locator('.tl-summary')).toContainText('31 mentions of 31 dates, from 1202 to 1979');
		await expect(page.locator('.tl-legend')).toContainText('Introduction');
		await expect(page.locator('.tl-legend .tl-legend-count')).toHaveText('31');
		const bars = page.locator('.tl-bar');
		const counted = await bars.evaluateAll((nodes) =>
			nodes.reduce((sum, node) => sum + Number(/(\d+) mention/.exec(node.getAttribute('aria-label') ?? '')?.[1]), 0),
		);
		expect(counted).toBe(30);

		// The toggle works from the keyboard and keeps the focus.
		const toggle = page.getByRole('button', { name: 'Show full range' });
		await toggle.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('button', { name: 'Show main period' })).toBeFocused();
		await expect(note).toContainText('Showing the full range, including 1 date far from the rest (1202).');
		years = (await tickLabels(page)).map(Number);
		expect(years[0]).toBeLessThanOrEqual(1250);
		await expect(page.locator('.tl-point')).toHaveCount(31);
		await expect(page.locator('.tl-point[aria-label^="1202"]')).toHaveCount(1);

		// And back.
		await page.getByRole('button', { name: 'Show main period' }).click();
		await expect(note).toContainText('1 date outside the main period (1202).');
		await expect(page.locator('.tl-point')).toHaveCount(30);
		years = (await tickLabels(page)).map(Number);
		expect(years[0]).toBeGreaterThanOrEqual(1945);

		// The export still has the date.
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		const rows = await sheetRows(download);
		expect(rows).toHaveLength(32);
		expect(rows[1][0]).toBe('1202');
	});

	test('an isolated date at the end is left off too', async ({ page }) => {
		await serveWikipediaArticle(page, yearSentences([...range(1950, 1979), 2091]));
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await expect(page.locator('.tl-range')).toContainText('1 date outside the main period (2091).');
		const years = (await tickLabels(page)).map(Number);
		expect(years[years.length - 1]).toBeLessThanOrEqual(1985);
		await expect(page.locator('.tl-point')).toHaveCount(30);
		await page.getByRole('button', { name: 'Show full range' }).click();
		const wide = (await tickLabels(page)).map(Number);
		expect(wide[wide.length - 1]).toBeGreaterThanOrEqual(2050);
		await expect(page.locator('.tl-point')).toHaveCount(31);
	});

	test('names several outside dates and keeps the filter list in step with the toggle', async ({ page }) => {
		// 42 dates, so up to two may be left out: one at each end.
		await serveWikipediaArticle(page, yearSentences([1105, ...range(1950, 1989), 2098]));
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await expect(page.locator('.tl-range')).toContainText('2 dates outside the main period (1105, 2098).');
		await page.locator('.tl-bar').first().click();
		const filtered = await page.locator('.tl-item').count();
		expect(filtered).toBeLessThan(42);
		await page.getByRole('button', { name: 'Show full range' }).click();
		// The buckets changed, so the filter is gone and the whole list is back.
		await expect(page.locator('.tl-item')).toHaveCount(42);
	});

	test('does not trim dates that are spread over the whole span, as in a history article', async ({ page }) => {
		// A first date a few centuries before the rest, then dates every 20 years: the shape of History of Paris.
		// (The first one is a full date: a bare year below 1000 is not read as a year.)
		await serveWikipediaArticle(page, `<p>The abbey was consecrated on 24 February 775.</p>${yearSentences(range(1100, 2020, 20))}`);
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await expect(page.locator('.tl-range')).toBeHidden();
		await expect(page.locator('.tl-point')).toHaveCount(48);
		const years = (await tickLabels(page)).map(Number);
		expect(years[0]).toBeLessThanOrEqual(800);
	});

	test('never trims an article with few dates', async ({ page }) => {
		await serveWikipediaArticle(page, yearSentences([1202, ...range(1950, 1960)]));
		await page.goto(WIKIPEDIA_URL);
		await openTimelineView(page);
		await expect(page.locator('.tl-range')).toBeHidden();
		await expect(page.locator('.tl-point')).toHaveCount(12);
	});
});

test.describe('arXiv: papers to spreadsheet', () => {
	test('listing: previews the papers, exports the ticked ones, and opens without the launcher', async ({ page }) => {
		const run = await serveArxiv(page, 'list');
		await page.goto(ARXIV_LIST_URL);
		await clickBookmarklet(page);

		// A single demo for this page opens directly.
		await expect(page.locator('.ks-stats')).toContainText('4 papers');
		await expect(page.locator(PANEL_TITLE)).toHaveText('Papers to spreadsheet');
		await expect(page.locator('.ks-stats')).toContainText('4 ticked');
		await expect(page.locator('.ap-table tbody tr')).toHaveCount(4);
		await expect(page.locator('.ap-table')).toContainText('2609.00003');
		await expect(page.locator('.ap-table')).toContainText('Synthetic paper three: notes on bookmarklets');
		await expect(page.locator('.ap-table')).toContainText('Eli Fixture, Fay Mock');

		// Untick the second paper: three are exported.
		await page.getByLabel('Include 2609.00002').uncheck();
		await expect(page.locator('.ks-stats')).toContainText('3 ticked');
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		expect(download.suggestedFilename()).toBe('arxiv-list-cs-ai-recent.xlsx');
		const book = await readWorkbook(download);
		expect(book.SheetNames).toEqual(['Papers']);
		const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Papers, { header: 1 });
		expect(rows[0]).toEqual(['ID', 'Title', 'Authors', 'Primary category', 'Abstract link', 'PDF link']);
		expect(rows).toHaveLength(4);
		expect(rows[1]).toEqual([
			'2609.00001',
			'Synthetic paper one: agents that read tables',
			'Ada Example, Ben Sample, Chi Placeholder',
			'cs.AI',
			'https://arxiv.org/abs/2609.00001',
			'https://arxiv.org/pdf/2609.00001',
		]);
		expect(rows.map((row) => row[0])).toEqual(['ID', '2609.00001', '2609.00003', '2609.00004']);
		expect(rows[3][3]).toBe('cs.CL');

		// Untick all: nothing to export, and a message says so.
		await page.getByRole('button', { name: 'Untick all' }).click();
		await expect(page.locator('.ks-stats')).toContainText('0 ticked');
		await page.getByRole('button', { name: 'Export to Excel' }).click();
		await expect(page.getByText('Tick at least one paper to export.')).toBeVisible();
		await page.getByRole('button', { name: 'Tick all', exact: true }).click();
		await expect(page.locator('.ks-stats')).toContainText('4 ticked');

		// Only the fixture page and jsDelivr were requested, and the page itself is unchanged.
		expect(run.requests.filter((entry) => !entry.startsWith('cdn.jsdelivr.net/') && !entry.startsWith('arxiv.org/list/'))).toEqual([]);
		expect(await run.cspViolations()).toEqual([]);
	});

	test('"Back to all demos" lists the single demo of the site, and it can be opened again', async ({ page }) => {
		await serveArxiv(page, 'list');
		await page.goto(ARXIV_LIST_URL);
		await clickBookmarklet(page);
		await expect(page.locator(PANEL_TITLE)).toHaveText('Papers to spreadsheet');
		await page.getByRole('button', { name: 'Back to all demos' }).click();
		await expect(page.getByText('Demos for arXiv')).toBeVisible();
		await expect(page.locator('.agentlet-demo-card')).toHaveCount(1);
		await page.getByRole('button', { name: 'Try it' }).click();
		await expect(page.locator('.ap-table tbody tr')).toHaveCount(4);
	});

	test('search results: reads the first tag as the primary category', async ({ page }) => {
		await serveArxiv(page, 'search');
		await page.goto(ARXIV_SEARCH_URL);
		await clickBookmarklet(page);
		await expect(page.locator('.ks-stats')).toContainText('3 papers');
		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export to Excel' }).click()]);
		expect(download.suggestedFilename()).toBe('arxiv-search.xlsx');
		const book = await readWorkbook(download);
		const rows = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Papers, { header: 1 });
		expect(rows.map((row) => row[0])).toEqual(['ID', '2609.00001', '2609.00002', '2609.00003']);
		expect(rows.map((row) => row[3])).toEqual(['Primary category', 'cs.AI', 'cs.LG', 'cs.AI']);
		expect(rows[2][1]).toBe('Synthetic paper two: a study of $\\alpha$-stable widgets');
		expect(rows[1][5]).toBe('https://arxiv.org/pdf/2609.00001');
	});

	test('abstract page: shows a citation line built from the page and copies it', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://arxiv.org' });
		const run = await serveArxiv(page, 'abs');
		await page.goto(ARXIV_ABS_URL);
		await clickBookmarklet(page);
		await expect(page.getByRole('heading', { name: 'Paper details' })).toBeVisible();
		const citation = 'Ada Example, Ben Sample, Chi Placeholder et al. Synthetic paper one: agents that read tables. arXiv:2609.00001 [cs.AI], 2026.';
		await expect(page.locator('[data-role="citation"]')).toHaveText(citation);
		await page.getByRole('button', { name: 'Copy citation' }).click();
		await expect(page.getByText('Copied the citation.')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(citation);
		expect(await run.cspViolations()).toEqual([]);
	});
});
