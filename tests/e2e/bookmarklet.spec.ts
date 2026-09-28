import { expect, test } from '@playwright/test';

test.describe('Bookmarklet page', () => {
	test('builds a javascript: link from the current origin', async ({ page, baseURL }) => {
		await page.goto('/try/bookmarklet/');
		const href = await page.locator('#bookmarklet-link').getAttribute('href');
		expect(href).toBeTruthy();
		expect(href).toMatch(/^javascript:/);
		expect(href).toContain(new URL(baseURL ?? 'http://localhost').origin);
	});

	test('clicking the bookmarklet link opens the demo (Chromium only, real click through CSP)', async ({
		page,
	}) => {
		// A real, trusted click (as opposed to page.evaluate(), which runs
		// through the DevTools protocol and bypasses page CSP entirely) is what
		// makes this a meaningful check: it exercises the same script-src
		// 'unsafe-inline' allowance a visitor dragging this link to their
		// bookmarks bar and clicking it on agentlet.io would rely on. Not
		// verified here: Firefox and Safari, which this project's Playwright
		// setup does not install (Chromium only, see playwright.config.ts).
		await page.goto('/try/bookmarklet/');
		await page.locator('#bookmarklet-link').click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
	});
});
