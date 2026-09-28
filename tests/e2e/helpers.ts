import type { Locator, Page } from '@playwright/test';

/**
 * Tracks console errors, console.log output, and CSP violations for a page,
 * from before navigation. Call before `page.goto()` so the init script that
 * listens for `securitypolicyviolation` is present from the very first
 * document.
 *
 * `consoleLogs` covers agentlet-core's own informational logging, gated
 * behind `debugMode` (agentlet-core's Logger, see src/utils/system/Logger.ts):
 * this site never sets `debugMode` (see src/scripts/demo-loader.ts's core
 * config) and never calls `console.log` itself, so any entry here during a
 * demo run is either a debugMode regression in the core or a stray log this
 * site introduced.
 */
export async function trackPageHealth(page: Page): Promise<{
	consoleErrors: string[];
	consoleLogs: string[];
	cspViolations: () => Promise<string[]>;
}> {
	const consoleErrors: string[] = [];
	const consoleLogs: string[] = [];

	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
		if (message.type() === 'log') consoleLogs.push(message.text());
	});
	page.on('pageerror', (error) => {
		consoleErrors.push(String(error));
	});

	await page.addInitScript(() => {
		(window as unknown as { __cspViolations: string[] }).__cspViolations = [];
		document.addEventListener('securitypolicyviolation', (event) => {
			(window as unknown as { __cspViolations: string[] }).__cspViolations.push(
				`${event.violatedDirective}: ${event.blockedURI}`,
			);
		});
	});

	return {
		consoleErrors,
		consoleLogs,
		cspViolations: () =>
			page.evaluate(
				() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
			),
	};
}

export const DEMO_FLAG_KEY = 'agentlet:demo';

/**
 * Drives the "Enterprise sign-in (simulated)" popup flow (src/agentlets/
 * auth-demo.ts, src/pages/try/mock-idp/) to completion with the demo
 * account, starting from whichever button on `page` opens the popup (the
 * launcher's banner button, a locked card's "Sign in to try", or the
 * "Enterprise sign-in" panel's own button all call the same
 * startAuthentication()). Used by tests/e2e/enterprise-sign-in.spec.ts and
 * by tests/e2e/page-audit.spec.ts, since page-audit is one of the demos
 * locked behind this flow (src/agentlets/manifest.ts's `requiresSignIn`).
 * Returns the closed popup `Page`, mainly so a caller that wants to (e.g.
 * enterprise-sign-in.spec.ts's own health checks) can still inspect it.
 */
export async function signInThroughPopup(page: Page, trigger: Locator): Promise<Page> {
	const [popup] = await Promise.all([page.waitForEvent('popup'), trigger.click()]);
	await popup.waitForLoadState();
	await popup.getByLabel('Username').fill('demo');
	await popup.getByLabel('Password').fill('demo');

	// AuthManager closes the popup itself the instant it receives the
	// success message (its handleSuccess() calls cleanup(), which closes
	// the popup synchronously in the 'message' event handler), which can
	// happen before this click's own await resolves. waitForEvent('close')
	// must therefore be armed together with the click, in the same
	// Promise.all, the same pattern as the "popup" wait above: called
	// afterwards, sequentially, it can race and miss a close that already
	// happened, timing out even though sign-in succeeded.
	await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', { name: 'Sign in' }).click()]);
	return popup;
}
