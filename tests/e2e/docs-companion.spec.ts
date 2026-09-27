import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * A real doc page with at least one table and several code blocks
 * (src/content/docs/docs/guides/mount-api.md): one markdown table (the
 * ModuleMountContext field reference) and seven fenced code blocks.
 * Starlight's pagination puts "TypeScript" right after it (see
 * astro.config.mjs's sidebar order), used below to check the "next page"
 * command.
 */
const DOCS_PAGE = '/docs/guides/mount-api/';
const NEXT_DOCS_PAGE = '/docs/guides/typescript/';

async function openLauncherThenGoTo(page: import('@playwright/test').Page, path: string): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Try it on this page' }).click();
	await expect(page.locator('#agentlet-container')).toBeVisible();
	await page.goto(path);
	await expect(page.locator('#agentlet-app-name')).toHaveText('Documentation companion');
}

test.describe('Documentation companion: activation and handover', () => {
	test('the launcher offers a link to the docs instead of activating it on a non-docs page', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.locator('[data-try="docs-companion"]').click();
		await expect(page.getByText('Open the docs to try it.')).toBeVisible();

		await page.getByRole('button', { name: 'Go to the docs' }).click();
		await expect(page).toHaveURL(/\/docs\/$/);
	});

	test('becomes active on a docs page, replacing the launcher, and hands back on the way out', async ({ page }) => {
		const health = await trackPageHealth(page);

		await openLauncherThenGoTo(page, DOCS_PAGE);
		await expect(page.getByText('Runs on the documentation pages.')).toBeVisible();
		await expect(page.getByText('View the source of this agentlet')).toBeVisible();

		await page.goto('/');
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live demo');

		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});
});

test.describe('Documentation companion: command palette', () => {
	test('opens with the keyboard shortcut and with the panel button', async ({ page }) => {
		await openLauncherThenGoTo(page, DOCS_PAGE);

		await page.keyboard.press('Alt+Shift+D');
		const dialog = page.locator('.agentlet-command-dialog');
		await expect(dialog).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toBeHidden();

		await page.getByRole('button', { name: 'Open command palette' }).click();
		await expect(dialog).toBeVisible();
	});

	test('the excel command downloads one workbook with one sheet per table', async ({ page }, testInfo) => {
		const health = await trackPageHealth(page);
		await openLauncherThenGoTo(page, DOCS_PAGE);

		await page.getByRole('button', { name: 'Open command palette' }).click();
		await page.locator('.agentlet-command-input').fill('excel');

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Execute' }).click(),
		]);

		expect(download.suggestedFilename()).toBe('docs-guides-mount-api-tables.xlsx');
		const savePath = testInfo.outputPath(download.suggestedFilename());
		await download.saveAs(savePath);

		// mount-api.md has exactly one table, so this exercises the
		// single-table path (tables.download()); see
		// tests/e2e/docs-companion.spec.ts and docs-companion.ts's own doc
		// comment for the multi-table workaround this does not exercise.
		const workbookXml = execFileSync('unzip', ['-p', savePath, 'xl/workbook.xml'], { encoding: 'utf8' });
		const sheetCount = (workbookXml.match(/<sheet\b/g) ?? []).length;
		expect(sheetCount).toBe(1);

		await expect(page.getByText('Exported 1 table to docs-guides-mount-api-tables.xlsx.')).toBeVisible();
		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('the copy command copies every code block, separated, and confirms the count', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		const health = await trackPageHealth(page);
		await openLauncherThenGoTo(page, DOCS_PAGE);

		await page.getByRole('button', { name: 'Open command palette' }).click();
		await page.locator('.agentlet-command-input').fill('copy');
		await page.getByRole('button', { name: 'Execute' }).click();

		await expect(page.getByText(/Copied \d+ code examples? to the clipboard\./)).toBeVisible();

		const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardText).toContain('// Example 1 of 7');
		expect(clipboardText).toContain('async mount(container: HTMLElement, context: ModuleMountContext): Promise<void>;');
		expect(clipboardText).toContain('// ----------');

		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('the next command follows Starlight\'s pagination link', async ({ page }) => {
		const health = await trackPageHealth(page);
		await openLauncherThenGoTo(page, DOCS_PAGE);

		await page.getByRole('button', { name: 'Open command palette' }).click();
		await page.locator('.agentlet-command-input').fill('next');
		await page.getByRole('button', { name: 'Execute' }).click();

		await expect(page).toHaveURL(new RegExp(`${NEXT_DOCS_PAGE}$`));
		expect(health.consoleErrors).toEqual([]);
	});
});

test.describe('Documentation companion: reading progress', () => {
	test('updates as pages are visited, persists across navigation, and resets', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/');
		await expect(page.getByText(/^1 of \d+ docs pages visited\.$/)).toBeVisible();

		await page.goto(DOCS_PAGE);
		await expect(page.getByText(/^2 of \d+ docs pages visited\.$/)).toBeVisible();
		await expect(page.getByText('Introduction, 0% read')).toBeVisible();
		await expect(page.getByText('Mount API, 0% read')).toBeVisible();

		await page.getByRole('button', { name: 'Reset progress' }).click();
		await expect(page.getByText(/^1 of \d+ docs pages visited\.$/)).toBeVisible();
		await expect(page.getByText('Mount API, 0% read')).toBeVisible();
		await expect(page.getByText('Introduction, 0% read')).toHaveCount(0);
	});
});

test.describe('Documentation companion: theming', () => {
	test('a dark site theme gives a dark panel on a docs page', async ({ page }) => {
		await page.addInitScript(() => {
			try {
				localStorage.setItem('starlight-theme', 'dark');
			} catch {
				// see src/components/landing/ThemeToggle.astro for the same guard
			}
		});

		await openLauncherThenGoTo(page, DOCS_PAGE);

		// DARK_THEME.backgroundColor in src/scripts/demo-loader.ts is #0b1a26.
		await expect
			.poll(() =>
				page
					.locator('#agentlet-container')
					.evaluate((element) => getComputedStyle(element).backgroundColor),
			)
			.toBe('rgb(11, 26, 38)');
	});
});
