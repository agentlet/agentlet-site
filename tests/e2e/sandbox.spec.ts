import { expect, test } from '@playwright/test';
import { signInThroughPopup, trackPageHealth } from './helpers';

/**
 * The home page's demo sandbox (src/components/landing/TrySandbox.astro): a
 * native <details id="sandbox">, collapsed by default and styled as its own
 * visually separate zone. src/agentlets/shared.ts's openSandbox() opens it
 * for the expense-receipt and page-audit demos; see tests/e2e/
 * expense-receipt.spec.ts and tests/e2e/page-audit.spec.ts for what those
 * two demos do with it once it is open.
 */

test.describe('Demo sandbox', () => {
	test('is collapsed on load, as its own labeled, visually separate zone', async ({ page }) => {
		await page.goto('/');

		const details = page.locator('#sandbox');
		await expect(details).toHaveJSProperty('open', false);

		// The summary itself carries the "Demo sandbox" label and is visible
		// (and readable) even while collapsed; the content it discloses is not.
		await expect(page.getByText('Demo sandbox: a sample receipt, an expense form and a supplier form')).toBeVisible();
		await expect(page.locator('#expense-form')).toBeHidden();
		await expect(page.locator('[data-demo-defect="table-headers"]')).toBeHidden();
	});

	test('opens by hand, with the keyboard, and the form still works and sends nothing', async ({ page }) => {
		await page.goto('/');

		const summary = page.locator('#sandbox summary');
		await summary.focus();
		await page.keyboard.press('Enter');
		await expect(page.locator('#sandbox')).toHaveJSProperty('open', true);
		await expect(page.locator('#expense-form')).toBeVisible();

		const requests: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') requests.push(request.url());
		});

		await page.locator('#expense-vendor').fill('Test vendor');
		await page.locator('#expense-form').getByRole('button', { name: 'Submit' }).click();
		await expect(page.locator('[data-form-status]')).toHaveText('Demo form. Nothing was sent.');
		expect(requests).toEqual([]);
	});

	test('opens and scrolls into view when the expense-receipt demo activates', async ({ page }) => {
		const health = await trackPageHealth(page);
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.locator('[data-try="expense-receipt"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Receipt to expense report');

		await expect(page.locator('#sandbox')).toHaveJSProperty('open', true);
		await expect(page.locator('#expense-form')).toBeInViewport();

		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});

	test('opens and scrolls into view when the page-audit demo activates, and the audit panel says so', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// page-audit is locked until sign-in (manifest.ts's requiresSignIn,
		// see tests/e2e/enterprise-sign-in.spec.ts for the lock/unlock flow
		// itself).
		await signInThroughPopup(page, page.getByRole('button', { name: 'Sign in with your company account (simulated)' }));
		await page.locator('[data-try="page-audit"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		// Opened as soon as the demo activates, before "Run the audit" is even
		// clicked (see PageAuditModule.activateModule() in page-audit.ts).
		await expect(page.locator('#sandbox')).toHaveJSProperty('open', true);
		await expect(page.locator('#expense-form')).toBeInViewport();

		await page.getByRole('button', { name: 'Run the audit' }).click();
		await expect(page.locator('.agentlet-fullscreen-dialog')).toBeVisible({ timeout: 8_000 });
		await page.getByRole('button', { name: 'Close' }).click();

		await expect(page.getByText('Opened the demo sandbox below so its defects could be checked.')).toBeVisible();
	});
});
