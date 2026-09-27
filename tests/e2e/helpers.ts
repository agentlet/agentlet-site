import type { Page } from '@playwright/test';

/**
 * Tracks console errors and CSP violations for a page, from before
 * navigation. Call before `page.goto()` so the init script that listens for
 * `securitypolicyviolation` is present from the very first document.
 */
export async function trackPageHealth(page: Page): Promise<{
	consoleErrors: string[];
	cspViolations: () => Promise<string[]>;
}> {
	const consoleErrors: string[] = [];

	page.on('console', (message) => {
		if (message.type() === 'error') consoleErrors.push(message.text());
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
		cspViolations: () =>
			page.evaluate(
				() => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
			),
	};
}

export const DEMO_FLAG_KEY = 'agentlet:demo';
