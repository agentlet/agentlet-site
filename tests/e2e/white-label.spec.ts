import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * The "Live white label" demo agentlet (src/agentlets/white-label.tsx):
 * rebrands the whole agentlet panel between three fictitious company themes
 * via `agentlet.setTheme()`, with its panel content mounted as a React tree
 * through the mount API. Runs against the built site, real CSP headers
 * included (see playwright.config.ts).
 *
 * `colorScheme: 'light'` pins the site's initial light/dark mode so the
 * test can assert exact colours without depending on the runner's own
 * default; the site toggle (`#theme-toggle`) is exercised explicitly below.
 */
test.use({ colorScheme: 'light' });

// Real panel chrome header (agentlet-core's own `.agentlet-header`, styled
// from `theme.headerBackground`/`headerTextColor` via StyleInjector), not
// this module's own in-panel preview: this is "the panel header" the theme
// switch is meant to restyle.
const PANEL_HEADER = '.agentlet-header';

test.describe('Live white label agentlet', () => {
	test('switches company themes, follows the site toggle, persists, and restores the brand theme on leaving', async ({
		page,
	}) => {
		// Wide enough that the theme toggle is not covered by the open panel
		// (see tests/e2e/reliability.spec.ts's own note: the header's layout,
		// owned by another lot, is not adjusted for the panel's width below
		// roughly 1500px).
		await page.setViewportSize({ width: 1920, height: 1000 });
		const health = await trackPageHealth(page);

		const agentletRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().includes('/cdn/v1/agentlets/')) agentletRequests.push(request.url());
		});

		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// white-label is `lazy: true` in the manifest: its own bundle (React
		// and ReactDOM included, see the doc comment at the top of
		// src/agentlets/white-label.tsx) must not be requested just to list
		// it in the launcher.
		expect(agentletRequests.some((url) => url.includes('white-label.js'))).toBe(false);

		await page.locator('[data-try="white-label"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live white label');
		expect(agentletRequests.some((url) => url.includes('white-label.js'))).toBe(true);

		// Starts in the agentlet brand: no company chosen yet, so "Reset to
		// agentlet brand" has nothing to do.
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Agentlet brand (light)');
		await expect(page.locator('[data-action="reset-brand"]')).toBeDisabled();

		// Switch through all three companies. Each check covers both the
		// React text (re-rendered from the module's own state) and the real
		// panel header's computed colour (the theme actually applied through
		// agentlet.setTheme()).
		await page.locator('[data-select-company="freight"]').click();
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Fictional Freight Co (light)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(31, 41, 55)');

		await page.locator('[data-select-company="health"]').click();
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Example Health Group (light)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(13, 148, 136)');

		await page.locator('[data-select-company="bank"]').click();
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Sample Bank (light)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(30, 58, 95)');

		// The closing message appears once, after the first company switch.
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible();
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();

		// The site's own light/dark toggle reapplies the matching variant of
		// the active company (Sample Bank), not the agentlet brand that
		// src/scripts/demo-loader.ts's own listener tries to reapply on every
		// toggle (see the doc comment on _handleThemeChanged in
		// src/agentlets/white-label.tsx for how the two are kept from fighting).
		await page.locator('#theme-toggle').click();
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Sample Bank (dark)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(202, 138, 4)');

		// Reload: the saved company (Sample Bank) is restored, for the site
		// mode now in effect (dark, from the toggle above), via the reopen
		// flag (src/scripts/demo-loader.ts) plus this module's own storage
		// read in mount().
		await page.reload();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live white label');
		await expect(page.locator('.wl-active-theme-label')).toHaveText('Sample Bank (dark)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(202, 138, 4)');

		// Switching back to the launcher restores the agentlet brand theme on
		// the real panel header (dark variant, since the site is still dark).
		// Activated directly through the module registry, the same technique
		// tests/e2e/expense-receipt.spec.ts already uses: white-label's own
		// pattern matches every non-docs page, so there is no URL to navigate
		// to that switches back to the launcher on its own the way
		// tests/e2e/docs-companion.spec.ts does for that agentlet.
		await page.evaluate(() => {
			const registry = (
				window as unknown as {
					agentlet: { moduleRegistry: { get(name: string): unknown; activateModule(m: unknown): Promise<void> } };
				}
			).agentlet.moduleRegistry;
			const launcher = registry.get('launcher');
			if (launcher) void registry.activateModule(launcher);
		});
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live demo');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(244, 162, 97)');

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('"Reset to agentlet brand" restores the brand theme without leaving the demo', async ({ page }) => {
		const health = await trackPageHealth(page);

		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await page.locator('[data-try="white-label"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Live white label');

		await page.locator('[data-select-company="health"]').click();
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(13, 148, 136)');

		const resetButton = page.locator('[data-action="reset-brand"]');
		await expect(resetButton).toBeEnabled();
		await resetButton.click();

		await expect(page.locator('.wl-active-theme-label')).toHaveText('Agentlet brand (light)');
		await expect(page.locator(PANEL_HEADER)).toHaveCSS('background-color', 'rgb(15, 51, 80)');
		await expect(resetButton).toBeDisabled();

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});
});
