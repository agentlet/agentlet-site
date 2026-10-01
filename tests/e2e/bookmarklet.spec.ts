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

	test('on another site, offers the known-sites demos instead of failing silently', async ({ page, baseURL }) => {
		await page.goto('/try/bookmarklet/');
		const href = (await page.locator('#bookmarklet-link').getAttribute('href')) ?? '';
		const code = decodeURIComponent(href.replace(/^javascript:/, ''));
		const siteOrigin = new URL(baseURL ?? 'http://localhost').origin;

		// 127.0.0.1 and localhost are different origins, so this is "another site".
		const otherOrigin = siteOrigin.replace('localhost', '127.0.0.1');
		expect(otherOrigin).not.toBe(siteOrigin);
		await page.goto(`${otherOrigin}/try/bookmarklet/`);

		let message = '';
		page.once('dialog', async (dialog) => {
			message = dialog.message();
			await dialog.accept();
		});
		await page.evaluate(code);

		await page.waitForURL(`${siteOrigin}/try/known-sites/`);
		expect(message).toContain('only runs on agentlet.io');
	});
});
