import { expect, test } from '@playwright/test';
import { DEMO_FLAG_KEY, trackPageHealth } from './helpers';

test.describe('Hero live demo button', () => {
	test('nothing is downloaded from /cdn/ before the button is clicked', async ({ page }) => {
		const cdnRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/cdn/')) cdnRequests.push(request.url());
		});

		await page.goto('/');
		await page.waitForLoadState('networkidle');

		expect(cdnRequests).toEqual([]);
	});

	test('clicking it loads the core and opens the panel with the launcher', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/');

		const [coreRequest] = await Promise.all([
			page.waitForRequest((request) => request.url().includes('/cdn/v1/agentlet-core.min.js')),
			page.getByRole('button', { name: 'Try it on this page' }).click(),
		]);
		expect(coreRequest.url()).toContain('/cdn/v1/agentlet-core.min.js');

		// #agentlet-container lives inside the panel's open shadow root;
		// Playwright's locators pierce open shadow DOM by default. The empty
		// state ("The first demos are on their way.") is gone now that a real
		// demo agentlet exists; see tests/e2e/expense-receipt.spec.ts for that
		// demo's own coverage.
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.locator('[data-demo="expense-receipt"]')).toBeVisible();

		// getPanelTitle() (src/agentlets/launcher.ts) labels the header "Live
		// demo" instead of the core's own fallback, the module's raw name
		// ("Launcher").
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live demo');

		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('the mobile hint replaces the button and the bookmarklet link below 768px wide', async ({ page }) => {
		await page.setViewportSize({ width: 500, height: 800 });
		await page.goto('/');

		await expect(page.getByRole('button', { name: 'Try it on this page' })).toBeHidden();
		await expect(page.getByRole('link', { name: 'Or try it on any page' })).toBeHidden();
		await expect(page.getByText('Best on desktop')).toBeVisible();
	});
});

test.describe('Demo session flag', () => {
	test('survives a full-page navigation and closing the panel clears it', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/try/bookmarklet/');
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.locator('[data-demo="expense-receipt"]')).toBeVisible();

		// The real close button (agentlet-core's own createDiscreteCloseButton())
		// calls the core's cleanup(), which emits `core:cleanup`; that event is
		// what clears the flag, not merely hiding or minimizing the panel.
		await page.locator('#agentlet-close-btn').click();
		const flagAfterClose = await page.evaluate(
			(key) => sessionStorage.getItem(key),
			DEMO_FLAG_KEY,
		);
		expect(flagAfterClose).toBeNull();

		const cdnRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/cdn/')) cdnRequests.push(request.url());
		});
		await page.reload();
		await page.waitForLoadState('networkidle');
		expect(cdnRequests).toEqual([]);
	});
});
