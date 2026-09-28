import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import * as XLSX from 'xlsx';
import { trackPageHealth } from './helpers';

/**
 * The compare-export demo agentlet (src/agentlets/compare-export.ts): reads
 * the home page's "Compared to robots" table
 * (src/components/landing/Comparison.astro, `table.comparison-table`, ten
 * rows), offers three predefined reader profiles, highlights the rows that
 * matter to whichever one is picked, and exports the table with two extra
 * columns marking that relevance. Runs against the built site, real CSP
 * headers included (see playwright.config.ts).
 *
 * Row counts per profile mirror compare-export.ts's own PROFILES mapping:
 * Finance team 4 rows, Cautious IT department 5 rows, Product team 4 rows.
 */

async function openCompareExport(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Try it on this page' }).click();
	await expect(page.locator('#agentlet-container')).toBeVisible();
	await page.locator('[data-try="compare-export"]').click();
	await expect(page.locator('#agentlet-app-name')).toHaveText('Compare and export');
}

test.describe('Compare and export agentlet', () => {
	test('choosing profiles highlights the right rows, exports them, and persists across a reload', async ({
		page,
	}) => {
		const health = await trackPageHealth(page);
		await openCompareExport(page);

		// Before any profile is chosen.
		await expect(page.getByText('No profile chosen yet.')).toBeVisible();
		const chooseButton = page.getByRole('button', { name: 'Choose profile' });
		await expect(chooseButton).toBeVisible();

		// Choose "Finance team": 4 relevant rows.
		await chooseButton.click();
		await expect(page.getByText('Pick who is reading this comparison.')).toBeVisible();
		await page.getByRole('button', { name: 'Finance team', exact: true }).click();

		await expect(page.getByText('Profile:')).toContainText('Finance team');
		await expect(page.getByText('4 rows highlighted on the page:')).toBeVisible();
		const financeRowList = page.locator('.compare-export-row-list');
		await expect(financeRowList.getByText('Security, scope of action')).toBeVisible();
		await expect(financeRowList.getByText('Relies on user context')).toBeVisible();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(4);
		await expect(page.locator('.agentlet-tooltip')).toHaveCount(4);
		await expect(page.locator('table.comparison-table')).toBeInViewport();

		// "Clear highlights" removes the highlights without forgetting the
		// chosen profile.
		const clearButton = page.getByRole('button', { name: 'Clear highlights' });
		await expect(clearButton).toBeEnabled();
		await clearButton.click();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		await expect(clearButton).toBeDisabled();
		await expect(page.getByText('Profile:')).toContainText('Finance team');

		// "Change profile" reopens the same dialog, with the current profile
		// first (the module's own "preselect" for the dialog, see
		// _openProfileDialog() in compare-export.ts).
		const changeButton = page.getByRole('button', { name: 'Change profile' });
		await changeButton.click();
		const dialogButtonTexts = await page.locator('.agentlet-info-buttons button').allTextContents();
		expect(dialogButtonTexts[0]).toBe('Finance team');

		// Cancel leaves the profile and highlights untouched.
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByText('Profile:')).toContainText('Finance team');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);

		// Switch to "Cautious IT department": 5 relevant rows, replacing the
		// (already cleared) finance highlights.
		await changeButton.click();
		await page.getByRole('button', { name: 'Cautious IT department', exact: true }).click();
		await expect(page.getByText('Profile:')).toContainText('Cautious IT department');
		await expect(page.getByText('5 rows highlighted on the page:')).toBeVisible();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(5);
		await expect(page.locator('.agentlet-tooltip')).toHaveCount(5);

		// Switch to "Product team": 4 relevant rows, replacing the 5 above.
		await page.getByRole('button', { name: 'Change profile' }).click();
		await page.getByRole('button', { name: 'Product team', exact: true }).click();
		await expect(page.getByText('Profile:')).toContainText('Product team');
		await expect(page.getByText('4 rows highlighted on the page:')).toBeVisible();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(4);
		await expect(page.locator('.compare-export-row-list').getByText('Interacts with page like a user')).toBeVisible();

		// Export to Excel: the table plus "Relevant for Product team" and "Why".
		const exportButton = page.getByRole('button', { name: 'Export to Excel', exact: true });
		const [download] = await Promise.all([page.waitForEvent('download'), exportButton.click()]);
		expect(download.suggestedFilename()).toBe('compare-and-export.xlsx');
		const path = await download.path();
		expect(path).toBeTruthy();

		const workbook = XLSX.read(readFileSync(path as string), { type: 'buffer' });
		expect(workbook.SheetNames).toEqual(['Comparison']);
		const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets['Comparison'], { header: 1 });
		expect(rows[0]).toEqual(['Aspect', 'Robot', 'Bookmarklet', 'Extension', 'Native', 'Relevant for Product team', 'Why']);
		expect(rows.length).toBe(11); // header + 10 table rows

		const productRelevantAspects = new Set([
			'Interacts with page like a user',
			'Autonomy',
			'Installation',
			'Goes beyond current page',
		]);
		const dataRows = rows.slice(1);
		expect(dataRows).toHaveLength(10);
		let relevantCount = 0;
		for (const row of dataRows) {
			const aspect = row[0];
			const relevantCell = row[5];
			const whyCell = row[6];
			if (productRelevantAspects.has(aspect)) {
				relevantCount += 1;
				expect(relevantCell).toBe('Yes');
				expect(whyCell).toBeTruthy();
			} else {
				expect(relevantCell).toBe('No');
				expect(whyCell ?? '').toBe('');
			}
		}
		expect(relevantCount).toBe(4);

		// The closing bubble appears after the first export only, once.
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);

		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);

		// Reload: the demo reopens through the session flag
		// (src/scripts/demo-loader.ts), and the chosen profile ("Product
		// team") is preselected without asking again, restoring its
		// highlights automatically (compare-export.ts's own mount()).
		await page.reload();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Compare and export');
		await expect(page.getByText('Profile:')).toContainText('Product team');
		await expect(page.getByText('4 rows highlighted on the page:')).toBeVisible();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(4);

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('shows a clear message instead of failing silently away from the home page', async ({ page }) => {
		const health = await trackPageHealth(page);

		// The hero button that opens the demo only exists on the home page; a
		// docs page only ever reopens an already-open panel (see the inline
		// reopen script referenced from compare-export.ts's own doc comment),
		// so open it from home first, same approach as
		// expense-receipt.spec.ts's equivalent test.
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/live-demo/');
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// The launcher's own pattern excludes /docs/, so nothing auto-activates
		// there; activate this agentlet directly through the module registry,
		// the same way tests/e2e/expense-receipt.spec.ts exercises its own
		// defensive check. It is also a lazy registry entry (manifest.ts's
		// `lazy` field), so it must be loaded with loadModule() first.
		await page.evaluate(async () => {
			const registry = (
				window as unknown as {
					agentlet: {
						moduleRegistry: {
							get(name: string): unknown;
							getRegistryEntries(): Array<{ name: string; url: string; module: string; lazy?: boolean }>;
							loadModule(entry: { name: string; url: string; module: string; lazy?: boolean }): Promise<unknown>;
							activateModule(m: unknown): Promise<void>;
						};
					};
				}
			).agentlet.moduleRegistry;
			let instance = registry.get('compare-export');
			if (!instance) {
				const entry = registry.getRegistryEntries().find((candidate) => candidate.name === 'compare-export');
				if (entry) instance = await registry.loadModule(entry);
			}
			if (instance) await registry.activateModule(instance);
		});

		await expect(page.locator('.compare-export-intro')).toContainText("This demo works on agentlet.io's home page");
		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
	});
});
