import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

test.describe('Theme switching', () => {
	test('switching the site theme with the panel open keeps the active module and restyles the panel', async ({
		page,
	}) => {
		// Wide enough that the theme toggle is not covered by the open panel
		// (the header's own layout, owned by another lot, is not adjusted for
		// the panel's width below roughly 1500px).
		await page.setViewportSize({ width: 1920, height: 1000 });
		const health = await trackPageHealth(page);
		await page.goto('/');

		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		// The empty state ("The first demos are on their way.") is gone now
		// that a real demo agentlet exists; check for its card instead.
		await expect(page.locator('[data-demo="expense-receipt"]')).toBeVisible();

		const backgroundBefore = await page
			.locator('#agentlet-container')
			.evaluate((element) => getComputedStyle(element).backgroundColor);

		await page.getByRole('button', { name: 'Toggle color theme' }).click();

		// The launcher's content must survive the toggle: this is what broke
		// before the fix in src/scripts/demo-loader.ts (syncTheme()/wireLifecycle()),
		// where a theme change during the loading window was silently missed.
		await expect(page.locator('[data-demo="expense-receipt"]')).toBeVisible();
		await expect(page.getByText('No application detected')).toHaveCount(0);

		await expect
			.poll(() =>
				page
					.locator('#agentlet-container')
					.evaluate((element) => getComputedStyle(element).backgroundColor),
			)
			.not.toBe(backgroundBefore);

		expect(health.consoleErrors).toEqual([]);
	});

	test('opening the demo while the site is already in light theme gives a light panel', async ({ page }) => {
		await page.addInitScript(() => {
			try {
				localStorage.setItem('starlight-theme', 'light');
			} catch {
				// see src/components/landing/ThemeToggle.astro for the same guard
			}
		});
		await page.goto('/');

		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// LIGHT_THEME.backgroundColor in src/scripts/demo-loader.ts is #ffffff.
		await expect
			.poll(() =>
				page
					.locator('#agentlet-container')
					.evaluate((element) => getComputedStyle(element).backgroundColor),
			)
			.toBe('rgb(255, 255, 255)');
	});
});

test.describe('Registry reliability', () => {
	test('the registry loads on a docs page even after a long wait, with no timeout error', async ({ page }) => {
		test.setTimeout(45_000);
		const health = await trackPageHealth(page);
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/live-demo/');
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// Long enough to have caught the historical "Registry loading timeout
		// after 10000ms" race; see the comment on buildRegistry() in
		// scripts/build-cdn.mjs for why the registry now dispatches
		// synchronously instead of via a 10ms setTimeout.
		await page.waitForTimeout(11_000);

		expect(health.consoleErrors).toEqual([]);
	});

	// The launcher's own pattern excludes /docs/ (see src/agentlets/launcher.ts),
	// so reopening on a docs page leaves no module active there by design; this
	// only checks that showing that built-in state does not itself error, per
	// the coordinator's review (point 9): acceptable until a docs-targeting
	// demo agentlet exists.
	test('reopening on a docs page shows the panel with no active module, without erroring', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/live-demo/');
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.getByText('No application detected')).toBeVisible();

		expect(health.consoleErrors).toEqual([]);
	});
});
