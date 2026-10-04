import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * The selector-workshop demo agentlet (src/agentlets/selector-workshop.ts):
 * pick an element with agentlet-core's ElementSelector, build a robust CSS
 * selector for it, test and edit that selector live, and (for a form field)
 * see the form's structure via agentlet.forms.quickExport(). Runs against
 * the built site, real CSP headers included (see playwright.config.ts).
 *
 * Picks the home page sandbox's "Vendor" field (#expense-vendor, see
 * src/components/landing/TrySandbox.astro), the same form
 * src/agentlets/expense-receipt.ts operates on: it has a stable id, so the
 * robust selector is exactly "#expense-vendor", and it sits inside
 * #expense-form, exercising the form-export branch.
 */

const VENDOR_SELECTOR = '#expense-vendor';

async function openWorkshopOnHomePage(page: Page): Promise<void> {
	await page.goto('/');
	// The demo sandbox (#sandbox) is a collapsed <details> by default (see
	// src/components/landing/TrySandbox.astro), so #expense-vendor below it
	// is not visible until it is opened, the same way a real visitor would
	// open it before interacting with anything inside.
	await page.locator('#sandbox summary').click();
	await page.getByRole('button', { name: 'Try it on this page' }).click();
	await expect(page.locator('#agentlet-container')).toBeVisible();
	await page.locator('[data-try="selector-workshop"]').click();
	await expect(page.locator('#agentlet-app-name')).toHaveText('Selector workshop');
}

/** Drives ElementSelector like a real visitor: hover to highlight, then click to pick. */
async function pickElement(page: Page, selector: string): Promise<void> {
	await page.getByRole('button', { name: /^Pick (an|a different) element$/ }).click();
	await expect(page.locator('#agentlet-element-selector-overlay')).toBeVisible();
	const target = page.locator(selector);
	await target.hover();
	await target.click();
}

test.describe('Selector workshop agentlet on the home page', () => {
	test('picks the vendor field, builds "#expense-vendor", and highlights its one match', async ({ page }) => {
		const health = await trackPageHealth(page);
		await openWorkshopOnHomePage(page);

		await pickElement(page, VENDOR_SELECTOR);

		await expect(page.locator('#selector-workshop-input')).toHaveValue('#expense-vendor');
		await expect(page.locator('[data-role="match-status"]')).toHaveText('1 element matches.');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
		await expect(page.locator('.selector-picked-summary')).toContainText('input#expense-vendor');

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('shows the sandbox form structure via forms.quickExport() and copies it as JSON', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await openWorkshopOnHomePage(page);
		await pickElement(page, VENDOR_SELECTOR);

		// The sandbox form (#expense-form) has 7 interactable fields (vendor,
		// date, amount, vatAmount, currency, category, notes) plus the submit
		// button, which quickExport() also reports as an interactable element.
		await expect(page.locator('h4', { hasText: 'Form fields (8)' })).toBeVisible();
		const fieldLabels = page.locator('.selector-form-field-label');
		await expect(fieldLabels).toHaveCount(8);
		const labelTexts = await fieldLabels.allTextContents();
		expect(labelTexts.slice(0, 6)).toEqual(['Vendor', 'Date', 'Amount', 'VAT amount', 'Currency', 'Category']);

		await page.locator('[data-action="copy-form-json"]').click();
		await expect(page.getByText('Form fields copied to the clipboard as JSON.')).toBeVisible();
		const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
		const parsed = JSON.parse(clipboardText) as Array<{ selector: string }>;
		expect(parsed.some((field) => field.selector === '#expense-vendor')).toBe(true);
	});

	test('copying the selector confirms via a bubble, copies the exact text, and shows the closing bubble once', async ({
		page,
		context,
	}) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await openWorkshopOnHomePage(page);
		await pickElement(page, VENDOR_SELECTOR);

		await page.locator('[data-action="copy-selector"]').click();
		await expect(page.getByText('Selector copied to the clipboard.')).toBeVisible();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('#expense-vendor');

		// Shown once, after the first copy (see CLAUDE.md's demo rules).
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();

		// A second copy does not show a second closing bubble.
		await page.locator('[data-action="copy-snippet-query"]').click();
		await expect(page.getByText('Snippet copied to the clipboard.')).toBeVisible();
		await page.waitForTimeout(1_500);
		await expect(page.getByText('This ran on agentlet.io.')).toHaveCount(1);

		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);
	});

	test('copies both ready-to-use snippets with the current selector baked in', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await openWorkshopOnHomePage(page);
		await pickElement(page, VENDOR_SELECTOR);

		await expect(page.locator('[data-role="snippet-query"]')).toHaveText('document.querySelector("#expense-vendor")');
		await page.locator('[data-action="copy-snippet-query"]').click();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('document.querySelector("#expense-vendor")');

		await expect(page.locator('[data-role="snippet-highlight"]')).toHaveText(
			'window.agentlet.utils.PageHighlighter.highlight(document.querySelector("#expense-vendor"))',
		);
		await page.locator('[data-action="copy-snippet-highlight"]').click();
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
			'window.agentlet.utils.PageHighlighter.highlight(document.querySelector("#expense-vendor"))',
		);
	});

	test('live-editing the selector updates matches and highlights, an invalid selector shows a message with no exception, and Clear highlights works', async ({
		page,
	}) => {
		const health = await trackPageHealth(page);
		await openWorkshopOnHomePage(page);
		await pickElement(page, VENDOR_SELECTOR);

		const input = page.locator('#selector-workshop-input');
		const errorEl = page.locator('[data-role="selector-error"]');
		const clearButton = page.getByRole('button', { name: 'Clear highlights' });

		await expect(clearButton).toBeEnabled();

		// The expense form has exactly 5 <input> elements (vendor, date,
		// amount, vatAmount, notes; currency/category are <select>). The
		// supplier form next to it has more, so the selector is scoped.
		await input.fill('#expense-form input');
		await expect(page.locator('[data-role="match-status"]')).toHaveText('5 elements match.');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(5);
		await expect(errorEl).toBeHidden();

		// Invalid selector: a clear message, no thrown exception, highlights cleared.
		await input.fill(':::not-a-selector(((');
		await expect(errorEl).toBeVisible();
		await expect(errorEl).toHaveText('This is not a valid CSS selector.');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		await expect(clearButton).toBeDisabled();

		// Back to a valid selector re-enables highlighting.
		await input.fill('#expense-vendor');
		await expect(page.locator('[data-role="match-status"]')).toHaveText('1 element matches.');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(1);
		await expect(errorEl).toBeHidden();

		await clearButton.click();
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		await expect(clearButton).toBeDisabled();

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('Escape cancels picking and the panel recovers', async ({ page }) => {
		await openWorkshopOnHomePage(page);

		await page.getByRole('button', { name: 'Pick an element' }).click();
		await expect(page.locator('#agentlet-element-selector-overlay')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.locator('#agentlet-element-selector-overlay')).toBeHidden();
		// ElementSelector.stop() (triggered by Escape) has no callback into
		// this module (see selector-workshop.ts's _startPicking() comment); the
		// panel polls isActive to notice the cancellation and restore its
		// "Pick an element" button instead of getting stuck on "Cancel".
		await expect(page.getByRole('button', { name: 'Pick an element' })).toBeVisible({ timeout: 2_000 });
	});
});
