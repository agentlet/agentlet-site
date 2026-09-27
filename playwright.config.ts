import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the real built site: dist/ served by `wrangler dev`, so
 * public/_headers (the CSP and other security headers) is actually applied,
 * the same way it is on Cloudflare. `npm run build` must run first; this
 * config does not build on its own, so lint/check/build/test:e2e run in
 * that order (see the verification steps in the project's CLAUDE.md/report).
 *
 * Port comes from E2E_PORT, defaulting to 8790 (an uncommon port, to avoid
 * colliding with another local server).
 */
const PORT = Number(process.env.E2E_PORT) || 8790;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
	testDir: './tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: 'html',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
	webServer: {
		command: `npx wrangler dev --port ${PORT}`,
		url: BASE_URL,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
