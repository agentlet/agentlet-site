import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { trackPageHealth } from './helpers';

/**
 * The page-audit demo agentlet (src/agentlets/page-audit.ts): a deterministic
 * accessibility and structure audit of the current page. Runs against the
 * built site, real CSP headers included (see playwright.config.ts).
 *
 * Expected findings on the home page: exactly the three deliberate defects
 * marked with data-demo-defect in src/components/landing/TrySandbox.astro
 * (image-alt, table-headers, input-label). Checks run in this order (see
 * the CHECKS array in page-audit.ts): images, headings, tables, forms - so
 * findings are produced in that same order.
 */

test.describe('Page audit agentlet on the home page', () => {
	test('finds exactly the three sandbox defects and stays active past the 1s URL poll', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/');

		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await page.locator('[data-try="page-audit"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		// Regression check for agentlet-core's own URL-change fix
		// (ModuleRegistry.checkUrlChange() in agentlet-core): the active
		// module now stays active across the 1s poll as long as its own
		// pattern still matches, instead of the poll re-deriving the match
		// from scratch and re-activating the launcher a second after this
		// agentlet was activated by hand.
		await page.waitForTimeout(2_500);
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		await page.getByRole('button', { name: 'Run the audit' }).click();

		// The progress dialog, one step per check.
		await expect(page.locator('.agentlet-progress-dialog')).toBeVisible();

		// It hands off to the fullscreen report once the checks finish.
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible({ timeout: 8_000 });
		await expect(page.getByRole('heading', { name: 'Page audit report' })).toBeVisible();

		await expect(page.locator('.audit-report-summary')).toContainText('Images without proper alt text: 1 finding');
		await expect(page.locator('.audit-report-summary')).toContainText('Heading hierarchy: 0 findings');
		await expect(page.locator('.audit-report-summary')).toContainText('Tables without header cells: 1 finding');
		await expect(page.locator('.audit-report-summary')).toContainText('Form fields without a label: 1 finding');

		const findingElements = page.locator('.audit-element');
		await expect(findingElements).toHaveCount(3);
		await expect(findingElements.nth(0)).toHaveText('<img src="/demo/receipt-preview.png">');
		await expect(findingElements.nth(1)).toHaveText('<table class="sandbox-recent-table">');
		await expect(findingElements.nth(2)).toHaveText('<input id="expense-notes">');

		const severities = page.locator('.audit-severity');
		await expect(severities.nth(0)).toHaveText('moderate'); // alt text looks like a file name, not missing
		await expect(severities.nth(1)).toHaveText('serious'); // table has no header cells at all
		await expect(severities.nth(2)).toHaveText('serious'); // form field has no accessible label

		// "Show on page" for the table finding scrolls to and highlights it.
		await page.locator('.audit-finding').nth(1).getByRole('button', { name: 'Show on page' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeHidden();
		const table = page.locator('[data-demo-defect="table-headers"]');
		await expect(table).toBeInViewport();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);

		// The closing message links back to the sandbox, same as expense-receipt.ts.
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();
		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('closing the report highlights every finding, and Clear highlights removes them', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await page.locator('[data-try="page-audit"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		await page.getByRole('button', { name: 'Run the audit' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible({ timeout: 8_000 });

		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeHidden();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(3);

		const clearButton = page.getByRole('button', { name: 'Clear highlights' });
		await expect(clearButton).toBeEnabled();
		await clearButton.click();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		await expect(clearButton).toBeDisabled();
	});

	test('exports the report to Excel with one row per finding plus the header', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await page.locator('[data-try="page-audit"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		await page.getByRole('button', { name: 'Run the audit' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible({ timeout: 8_000 });
		await page.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeHidden();

		const exportButton = page.getByRole('button', { name: 'Export to Excel', exact: true });
		await expect(exportButton).toBeEnabled();
		const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);

		expect(download.suggestedFilename()).toBe('page-audit-report.xlsx');
		const path = await download.path();
		expect(path).toBeTruthy();

		const workbook = XLSX.read(readFileSync(path as string), { type: 'buffer' });
		expect(workbook.SheetNames).toEqual(['Page audit']);
		const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Page audit'], { header: 1 });
		expect(rows[0]).toEqual(['Check', 'Severity', 'Element', 'Detail', 'Page URL']);
		// Header row plus one row per finding (3 on the home page).
		expect(rows.length).toBe(4);
	});
});

test.describe('Page audit agentlet on the bookmarklet page', () => {
	test('finds nothing on /try/bookmarklet/', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/try/bookmarklet/');

		// No "Try it on this page" hero button here (home page only); use the
		// page's own bookmarklet link, a real trusted click through CSP, the
		// same way tests/e2e/bookmarklet.spec.ts opens the demo on this page.
		await page.locator('#bookmarklet-link').click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await page.locator('[data-try="page-audit"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		await page.getByRole('button', { name: 'Run the audit' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible({ timeout: 8_000 });

		await expect(page.locator('.audit-report-summary')).toContainText('Images without proper alt text: 0 findings');
		await expect(page.locator('.audit-report-summary')).toContainText('Heading hierarchy: 0 findings');
		await expect(page.locator('.audit-report-summary')).toContainText('Tables without header cells: 0 findings');
		await expect(page.locator('.audit-report-summary')).toContainText('Form fields without a label: 0 findings');
		await expect(page.locator('.audit-empty')).toHaveText('No issues found by these checks.');
		await expect(page.locator('.audit-element')).toHaveCount(0);

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});
});
