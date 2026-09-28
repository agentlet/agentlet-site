import { expect, test } from '@playwright/test';
import { trackPageHealth } from './helpers';

/**
 * The receipt-to-expense-report demo agentlet (src/agentlets/
 * expense-receipt.ts) and its sandbox (src/components/landing/
 * TrySandbox.astro). Runs against the built site, real CSP headers included
 * (see playwright.config.ts).
 */

test.describe('Expense receipt sandbox (hand use, no agentlet)', () => {
	test('filling the form and submitting by hand sends nothing', async ({ page }) => {
		const requests: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') requests.push(request.url());
		});

		await page.goto('/');

		// The sandbox is a collapsed <details> by default (see
		// tests/e2e/sandbox.spec.ts); open it by hand, the same way a visitor
		// would, before interacting with the form inside it.
		await page.locator('#sandbox summary').click();
		await expect(page.locator('#expense-form')).toBeVisible();

		await page.locator('#expense-vendor').fill('Test vendor');
		await page.locator('#expense-date').fill('2026-01-15');
		await page.locator('#expense-amount').fill('42.50');
		await page.locator('#expense-vat').fill('7.10');
		await page.locator('#expense-currency').selectOption('EUR');
		await page.locator('#expense-category').selectOption('travel');

		const urlBefore = page.url();
		await page.locator('#expense-form').getByRole('button', { name: 'Submit' }).click();

		await expect(page.locator('[data-form-status]')).toHaveText('Demo form. Nothing was sent.');
		expect(page.url()).toBe(urlBefore);
		expect(requests).toEqual([]);
	});

	test('the three deliberate accessibility defects are present', async ({ page }) => {
		await page.goto('/');
		await page.locator('#sandbox summary').click();

		const table = page.locator('[data-demo-defect="table-headers"]');
		await expect(table).toBeVisible();
		await expect(table.locator('th')).toHaveCount(0);
		await expect(table.locator('td')).toHaveCount(6); // 2 columns x 3 rows

		const notesInput = page.locator('[data-demo-defect="input-label"]');
		await expect(notesInput).toBeVisible();
		expect(await notesInput.getAttribute('placeholder')).toBeTruthy();
		expect(await notesInput.getAttribute('aria-label')).toBeNull();
		expect(await notesInput.getAttribute('aria-labelledby')).toBeNull();
		const notesId = await notesInput.getAttribute('id');
		expect(await page.locator(`label[for="${notesId}"]`).count()).toBe(0);

		const receiptImage = page.locator('[data-demo-defect="image-alt"]');
		await expect(receiptImage).toBeVisible();
		await expect(receiptImage).toHaveAttribute('alt', 'receipt-preview.png');
	});
});

test.describe('Expense receipt agentlet', () => {
	test('reads the receipt, fills the form, highlights it, and never submits', async ({ page }) => {
		const health = await trackPageHealth(page);
		const requests: string[] = [];
		page.on('request', (request) => {
			if (request.method() === 'POST') requests.push(request.url());
		});

		await page.goto('/');
		const urlBefore = page.url();

		// Open the launcher from the hero button, then pick this agentlet.
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();
		await page.locator('[data-try="expense-receipt"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Receipt to expense report');

		// Step 1: read the receipt.
		await page.getByRole('button', { name: 'Read the receipt' }).click();
		await expect(page.locator('.expense-thumb')).toBeVisible();
		await expect(page.locator('.expense-note')).toContainText('Only this sample receipt is supported');

		// Step 2: see what the AI receives. Expanded by default (review round
		// 1), and the recorded response is not shown yet: each step reveals
		// one thing.
		await page.getByRole('button', { name: 'See what the AI receives' }).click();
		const formDataDetails = page.locator('.expense-details');
		await expect(formDataDetails).toBeVisible();
		expect(await formDataDetails.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
		await expect(formDataDetails.locator('pre')).toContainText('"selector"');
		await expect(page.locator('.expense-recorded-label')).toHaveCount(0);

		// Step 3: fill the form (also highlights, scrolls, and shows both bubbles).
		await page.getByRole('button', { name: 'Fill the form' }).click();

		// The recorded response now appears, labeled, with the fill itself.
		await expect(page.locator('.expense-recorded-label')).toHaveText('Recorded AI response');
		await expect(page.locator('.expense-json').last()).toContainText('Riverside Bistro');

		await expect(page.locator('#expense-vendor')).toHaveValue('Riverside Bistro');
		await expect(page.locator('#expense-date')).toHaveValue('2026-03-14');
		await expect(page.locator('#expense-amount')).toHaveValue('79.20');
		await expect(page.locator('#expense-vat')).toHaveValue('13.20');
		await expect(page.locator('#expense-currency')).toHaveValue('GBP');
		await expect(page.locator('#expense-category')).toHaveValue('meals');

		// The changed fields plus the Submit button are highlighted with
		// PageHighlighter (review round 1: border only), and exactly one of
		// those highlights carries a message, on the Submit button.
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(7);
		await expect(page.locator('.agentlet-tooltip')).toHaveCount(1);
		await expect(page.locator('.agentlet-tooltip')).toHaveText('Check before submitting');

		// The sandbox form scrolls into view (review round 1: it sits below
		// the hero, out of view when the visitor clicks inside the panel).
		await expect(page.locator('#expense-form')).toBeInViewport();

		// "Check before submitting" bubble (agentlet-core's MessageBubble
		// markup, not this project's own, hence .first() rather than a class
		// hook this project controls) appears right away...
		await expect(page.getByText('Check before submitting.').first()).toBeVisible();

		// ...but the closing bubble is delayed by ~2s, not stacked with it at
		// the same instant (review round 1): still absent right as the first
		// one appears, then visible within the delay window.
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).not.toBeVisible();
		await expect(closingLink).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();
		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);
		await expect(page.locator('#demo')).toBeInViewport();

		// Start over clears the form, the highlights, and the bubbles, and
		// resets the steps.
		await page.getByRole('button', { name: 'Start over' }).click();
		await expect(page.locator('#expense-vendor')).toHaveValue('');
		await expect(page.locator('.agentlet-highlight-border')).toHaveCount(0);
		await expect(page.getByText('Check before submitting.')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'See it on a real business app' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Read the receipt' })).toBeVisible();

		// The demo never submitted the form itself: only the in-page anchor
		// link changed the URL (a hash change, not a navigation to a new page).
		expect(new URL(page.url()).pathname).toBe(new URL(urlBefore).pathname);
		expect(requests).toEqual([]);

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('shows a clear message instead of failing silently away from the home page', async ({ page }) => {
		const health = await trackPageHealth(page);

		// The hero button that opens the demo only exists on the home page
		// (src/components/landing/Hero.astro); a docs page only ever reopens
		// an already-open panel (see the inline reopen script in CLAUDE.md /
		// src/scripts/agentlet-inline-snippets.mjs), so open it from home first.
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		await page.goto('/docs/live-demo/');
		await expect(page.locator('#agentlet-container')).toBeVisible();

		// The launcher's own pattern excludes /docs/, so nothing auto-activates
		// there; activate this agentlet directly through the module registry
		// to exercise its own defensive check (see the doc comment on
		// ExpenseReceiptModule in expense-receipt.ts). It is also a lazy
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
			let instance = registry.get('expense-receipt');
			if (!instance) {
				const entry = registry.getRegistryEntries().find((candidate) => candidate.name === 'expense-receipt');
				if (entry) instance = await registry.loadModule(entry);
			}
			if (instance) await registry.activateModule(instance);
		});

		await expect(page.locator('.expense-intro')).toContainText("This demo works on agentlet.io's home page");
		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
	});
});
