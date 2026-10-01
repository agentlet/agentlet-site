import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * "Back to all demos" on the home page (src/agentlets/shared.ts's
 * backToLauncherHtml(), handled by the launcher in src/agentlets/launcher.ts).
 * Every demo panel has the button; it asks the launcher to become the active
 * module again. The launcher is deactivated whenever a demo is picked, and
 * agentlet-core runs a module's cleanupModule() on every deactivation, so the
 * launcher must keep listening while it is not the active module.
 */

const TITLE = '#agentlet-app-name';

test.describe('Back to all demos', () => {
	test('returns to the launcher every time, across several demos', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator(TITLE)).toHaveText('Live demo');

		for (const demo of ['compare-export', 'section-summary', 'compare-export']) {
			await page.locator(`[data-try="${demo}"]`).click();
			await expect(page.locator(TITLE)).not.toHaveText('Live demo');
			await page.getByRole('button', { name: 'Back to all demos' }).click();
			await expect(page.locator(TITLE)).toHaveText('Live demo');
			await expect(page.locator('.agentlet-demo-card').first()).toBeVisible();
		}

		expect(health.consoleErrors).toEqual([]);
	});

	test('still works after a full page load restores the open demo', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await page.locator('[data-try="compare-export"]').click();
		await expect(page.locator(TITLE)).toHaveText('Compare and export');

		// The session flag reopens the demo that was active (src/scripts/demo-loader.ts).
		await page.reload();
		await expect(page.locator(TITLE)).toHaveText('Compare and export');
		await page.getByRole('button', { name: 'Back to all demos' }).click();
		await expect(page.locator(TITLE)).toHaveText('Live demo');

		await page.locator('[data-try="section-summary"]').click();
		await page.getByRole('button', { name: 'Back to all demos' }).click();
		await expect(page.locator(TITLE)).toHaveText('Live demo');
	});
});
