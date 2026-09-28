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
		// Playwright's locators pierce open shadow DOM by default. This text
		// is rendered regardless of how many demos the launcher lists (see
		// _render() in src/agentlets/launcher.ts), so it does not need
		// updating as demos are added or removed.
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.getByText('Pick a demo agentlet below.')).toBeVisible();

		// getPanelTitle() (src/agentlets/launcher.ts) labels the header "Live
		// demo" instead of the core's own fallback, the module's raw name
		// ("Launcher").
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live demo');

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
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
		await expect(page.getByText('Pick a demo agentlet below.')).toBeVisible();

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

test.describe('Lazy demo loading', () => {
	test('the expense-receipt and page-audit bundles are not requested until "Try it" is clicked', async ({
		page,
	}) => {
		const agentletRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/cdn/v1/agentlets/')) agentletRequests.push(request.url());
		});

		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.getByText('Pick a demo agentlet below.')).toBeVisible();

		// expense-receipt and page-audit are marked `lazy: true` in the
		// manifest (src/agentlets/manifest.ts), so init()'s eager registry
		// load must not have downloaded either bundle just to list them here.
		// The launcher's own bundle (loaded eagerly, it is the module the
		// loader activates by default) may already appear in agentletRequests;
		// that is expected and not checked against.
		expect(agentletRequests.some((url) => url.includes('expense-receipt.js'))).toBe(false);
		expect(agentletRequests.some((url) => url.includes('page-audit.js'))).toBe(false);

		await page.locator('[data-try="expense-receipt"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Receipt to expense report');

		expect(agentletRequests.some((url) => url.includes('expense-receipt.js'))).toBe(true);
		expect(agentletRequests.some((url) => url.includes('page-audit.js'))).toBe(false);
	});

	test('shows a clear error and leaves the button usable when a lazy demo fails to load', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.route('**/cdn/v1/agentlets/expense-receipt.js', (route) => route.abort());

		const tryButton = page.locator('[data-try="expense-receipt"]');
		await tryButton.click();

		await expect(page.getByText(/Could not load this demo \(expense-receipt\)/)).toBeVisible();
		await expect(tryButton).toBeEnabled();
		await expect(tryButton).toHaveText('Try it');
		// The launcher itself is still the active module: the failed load did
		// not leave the panel in a broken, half-activated state.
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live demo');
	});
});
