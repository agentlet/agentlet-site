import { expect, test } from '@playwright/test';

/**
 * The known-sites try page must be reachable from the home page (hero and
 * sandbox section) and from the docs sidebar.
 */
test.describe('Links to the known-sites page', () => {
	test('the home page hero links to it', async ({ page }) => {
		await page.goto('/');
		const link = page.locator('.hero').getByRole('link', { name: /real sites/ });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', '/try/known-sites/');
	});

	test('the home page sandbox section links to it', async ({ page }) => {
		await page.goto('/');
		const link = page.locator('.sandbox-zone').getByRole('link', { name: 'the known-sites bookmarklet' });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', '/try/known-sites/');
	});

	test('the docs sidebar links to it', async ({ page }) => {
		await page.goto('/docs/live-demo/');
		const link = page
			.locator('nav[aria-label="Main"]')
			.getByRole('link', { name: 'Try it on real sites' });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', '/try/known-sites/');
	});
});
