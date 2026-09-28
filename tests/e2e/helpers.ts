import type { Page } from '@playwright/test';

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
