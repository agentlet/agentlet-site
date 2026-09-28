import { expect, test } from '@playwright/test';
import { signInThroughPopup, trackPageHealth } from './helpers';

/**
 * The "Enterprise sign-in (simulated)" demo (src/agentlets/enterprise-sign-in.ts,
 * src/agentlets/auth-demo.ts), the launcher's lock/unlock UI for entries
 * marked `requiresSignIn` (src/agentlets/manifest.ts, src/agentlets/
 * launcher.ts: page-audit is the one locked demo), and the fictitious
 * identity provider it opens as a popup (src/pages/try/mock-idp/). Runs
 * against the built site, real CSP headers included (see
 * playwright.config.ts).
 */

test.describe('Locking and unlocking a demo', () => {
	test('locks page-audit until sign-in, unlocks it, opens it, then sign out locks it again', async ({ page }) => {
		const health = await trackPageHealth(page);
		const requests: string[] = [];
		// One BrowserContext, shared by this page and the popup it opens:
		// listening on the context (not just `page`) is what also catches any
		// request the popup itself makes.
		page.context().on('request', (request) => requests.push(request.url()));

		await page.goto('/');
		const baseOrigin = new URL(page.url()).origin;

		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		const pageAuditCard = page.locator('[data-demo="page-audit"]');
		await expect(pageAuditCard.locator('.agentlet-lock-badge')).toHaveText('Locked');
		await expect(pageAuditCard.getByRole('button', { name: 'Sign in to try' })).toBeVisible();
		await expect(pageAuditCard.getByRole('button', { name: 'Try it' })).toHaveCount(0);

		await signInThroughPopup(page, page.getByRole('button', { name: 'Sign in with your company account (simulated)' }));

		// Unlocked: the signed-in banner and the card both update, without a
		// page reload (the launcher panel re-renders on auth-demo.ts's
		// AUTH_CHANGED_EVENT).
		await expect(
			page.getByText('Signed in as Demo user (IT admin (simulated)). The locked demos below are unlocked.'),
		).toBeVisible();
		await expect(pageAuditCard.locator('.agentlet-lock-badge')).toHaveCount(0);
		await expect(pageAuditCard.getByRole('button', { name: 'Try it' })).toBeVisible();

		// The now-unlocked demo can actually be opened.
		await pageAuditCard.getByRole('button', { name: 'Try it' }).click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Page audit');

		// Back to the launcher (no in-panel "back to the list" control; same
		// direct-registry technique expense-receipt.spec.ts uses for its own
		// defensive-path test).
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

		// Signing out locks page-audit again.
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.getByText('Some demos below need a simulated company sign-in.')).toBeVisible();
		await expect(pageAuditCard.locator('.agentlet-lock-badge')).toHaveText('Locked');
		await expect(pageAuditCard.getByRole('button', { name: 'Try it' })).toHaveCount(0);

		// No request throughout this whole flow (page and popup alike) ever
		// left agentlet.io's own origin.
		expect(requests.length).toBeGreaterThan(0);
		for (const url of requests) {
			expect(new URL(url).origin).toBe(baseOrigin);
		}

		expect(health.consoleErrors).toEqual([]);
		expect(health.consoleLogs).toEqual([]); // debugMode is off (see src/scripts/demo-loader.ts); the core must stay silent.
		expect(await health.cspViolations()).toEqual([]);
	});

	test('wrong credentials are refused in the popup, without unlocking anything', async ({ page }) => {
		const health = await trackPageHealth(page);

		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await expect(page.locator('#agentlet-container')).toBeVisible();

		const [popup] = await Promise.all([
			page.waitForEvent('popup'),
			page.getByRole('button', { name: 'Sign in with your company account (simulated)' }).click(),
		]);
		const popupHealth = await trackPageHealth(popup);
		await popup.waitForLoadState();
		await expect(popup.getByRole('heading', { name: 'Sign in (simulated)' })).toBeVisible();

		await popup.getByLabel('Username').fill('wrong');
		await popup.getByLabel('Password').fill('wrong');
		await popup.getByRole('button', { name: 'Sign in' }).click();

		await expect(popup.getByRole('alert')).toHaveText('Invalid username or password. Use demo / demo.');
		// Refused in place: no redirect to the callback page, popup stays open.
		await expect(popup).toHaveURL(/\/try\/mock-idp\/$/);

		const pageAuditCard = page.locator('[data-demo="page-audit"]');
		await expect(pageAuditCard.locator('.agentlet-lock-badge')).toHaveText('Locked');

		// Health checks read the popup before closing it: reading from a
		// closed page throws.
		expect(popupHealth.consoleErrors).toEqual([]);
		expect(await popupHealth.cspViolations()).toEqual([]);
		await popup.close();

		expect(health.consoleErrors).toEqual([]);
		expect(await health.cspViolations()).toEqual([]);
	});
});

test.describe('The "Enterprise sign-in (simulated)" demo panel', () => {
	test('explains the flow and shows the current auth state, then the fake token claims once signed in', async ({
		page,
	}) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'Try it on this page' }).click();
		await page.locator('[data-try="enterprise-sign-in"]').click();
		await expect(page.locator('#agentlet-app-name')).toHaveText('Enterprise sign-in (simulated)');

		await expect(page.locator('[data-auth-status="signed-out"]')).toBeVisible();
		await expect(page.getByText('Not signed in.')).toBeVisible();

		await signInThroughPopup(page, page.getByRole('button', { name: 'Sign in with your company account (simulated)' }));

		await expect(page.locator('[data-auth-status="signed-in"]')).toBeVisible();
		await expect(page.getByText('Signed in as Demo user (IT admin (simulated)).')).toBeVisible();

		const claims = page.locator('.auth-claims pre');
		await expect(claims).toContainText('"sub": "demo-user-001"');
		await expect(claims).toContainText('"name": "Demo user"');
		await expect(claims).toContainText('"role": "IT admin (simulated)"');
		await expect(claims).toContainText('"demo": true');

		// The scenario ends here, the first time sign-in succeeds.
		const closingLink = page.getByRole('link', { name: 'See it on a real business app' });
		await expect(closingLink).toBeVisible({ timeout: 5_000 });
		await expect(page.getByText('This ran on agentlet.io.').first()).toBeVisible();
		await closingLink.click();
		await expect(page).toHaveURL(/#demo$/);

		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page.locator('[data-auth-status="signed-out"]')).toBeVisible();
	});
});
