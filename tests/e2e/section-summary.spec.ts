import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * The "Summarize and share a section" demo agentlet (src/agentlets/
 * section-summary.ts). Runs against the built site, real CSP headers
 * included (see playwright.config.ts).
 *
 * ElementSelector's overlay has `pointer-events: none` and listens for
 * clicks on `document` in the capturing phase (see agentlet-core's
 * ElementSelector.start()), so a normal Playwright click on a visible page
 * element while the selector is active is picked up the same way a real
 * visitor's click would be; nothing special is needed to drive it here.
 */

async function openSectionSummary(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/');
	await page.getByRole('button', { name: 'Try it on this page' }).click();
	await expect(page.locator('#agentlet-container')).toBeVisible();
	await page.locator('[data-try="section-summary"]').click();
	await expect(page.locator('#agentlet-app-name')).toHaveText('Summarize and share a section');
}

test.describe('Summarize and share a section agentlet', () => {
	test('summarizes the comparison section, copies the summary, downloads the image, and ends on the closing bubble', async ({
		page,
		context,
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		const health = await trackPageHealth(page);
		await openSectionSummary(page);

		await page.getByRole('button', { name: 'Pick a section' }).click();
		await page.getByRole('heading', { name: 'Compared to robots' }).click();

		const dialog = page.locator('.agentlet-fullscreen-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Compared to robots' })).toBeVisible();

		const label = dialog.locator('.section-summary-recorded-label');
		await expect(label).toHaveText('Recorded AI response');

		const image = dialog.locator('.section-summary-thumb');
		await expect(image).toBeVisible();
		await expect(image).toHaveAttribute('alt', 'Screenshot of the "Compared to robots" section of the home page');
		const imageSrc = await image.getAttribute('src');
		expect(imageSrc).toMatch(/^data:image\/png;base64,/);

		const summaryText = dialog.locator('.section-summary-text');
		await expect(summaryText).toContainText('Compares agentlets to RPA-style robots');

		// Copy the summary: clipboard, confirmed with a bubble.
		await dialog.getByRole('button', { name: 'Copy the summary' }).click();
		await expect(page.getByText('Summary copied to the clipboard.')).toBeVisible();
		const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboardText).toContain('Compares agentlets to RPA-style robots');

		// Download the image: a same-origin blob link, PNG.
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			dialog.getByRole('button', { name: 'Download the image' }).click(),
		]);
		expect(download.suggestedFilename()).toBe('agentlet-comparison-summary.png');
		const path = await download.path();
		expect(path).toBeTruthy();

		// Closing the dialog ends the scenario with the standard closing bubble.
		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible();
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();
		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('summarizes another known section (the hero)', async ({ page }) => {
		await openSectionSummary(page);

		await page.getByRole('button', { name: 'Pick a section' }).click();
		await page.getByRole('heading', { name: 'Augment the web apps you cannot change.' }).click();

		const dialog = page.locator('.agentlet-fullscreen-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Hero', exact: true })).toBeVisible();
		await expect(dialog.locator('.section-summary-recorded-label')).toHaveText('Recorded AI response');
		await expect(dialog.locator('.section-summary-text')).toContainText(
			'agentlet injects a side panel into a web app you cannot change',
		);

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();

		// The panel remembers the last pick.
		await expect(page.locator('.section-summary-last')).toContainText('Last picked: Hero');
	});

	test('gives the honest no-recorded-summary message for a section without one (the footer)', async ({ page }) => {
		const health = await trackPageHealth(page);
		await openSectionSummary(page);

		await page.getByRole('button', { name: 'Pick a section' }).click();
		// Clicks the footer's own "Docs" link, on the left side of the footer;
		// the panel itself is a fixed-position overlay docked to the right
		// edge of the viewport for the whole page height, including here, so a
		// target further right (e.g. the "Open source, MIT license" text) would
		// sit underneath it and never receive the click. ElementSelector's
		// document-level click listener calls `preventDefault()` before this
		// link's own navigation would run, so clicking it is safe.
		await page.locator('footer').getByRole('link', { name: 'Docs' }).click();

		const dialog = page.locator('.agentlet-fullscreen-dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('heading', { name: 'Footer', exact: true })).toBeVisible();

		// Still labeled the same way: the honest message is itself this demo's
		// recorded, fixed answer for an unmatched section, not a live model.
		await expect(dialog.locator('.section-summary-recorded-label')).toHaveText('Recorded AI response');
		await expect(dialog.locator('.section-summary-text')).toHaveText(
			'No recorded summary for this section. This demo only has recorded answers for the main sections of the home page.',
		);

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(page.locator('.section-summary-last')).toContainText('this section has no recorded summary');

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('shows a clear message instead of failing silently away from the home page', async ({ page }) => {
		const health = await trackPageHealth(page);

		// The hero button that opens the demo only exists on the home page; a
		// docs page only ever reopens an already-open panel (see the inline
		// reopen script in src/scripts/agentlet-inline-snippets.mjs), so open it
		// from home first, the same way expense-receipt.spec.ts does.
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/live-demo/');
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// The launcher's own pattern excludes /docs/, so nothing auto-activates
		// there; activate this agentlet directly through the module registry to
		// exercise its own defensive check (see the doc comment on
		// SectionSummaryModule in section-summary.ts). It is also a lazy
		// registry entry (manifest.ts's `lazy` field), so it must be loaded
		// with loadModule() first, the same way launcher.ts's "Try it" does,
		// before it can be activated.
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
			let instance = registry.get('section-summary');
			if (!instance) {
				const entry = registry.getRegistryEntries().find((candidate) => candidate.name === 'section-summary');
				if (entry) instance = await registry.loadModule(entry);
			}
			if (instance) await registry.activateModule(instance);
		});

		await expect(page.locator('.section-summary-intro')).toContainText("This demo works on agentlet.io's home page");
		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
	});
});
