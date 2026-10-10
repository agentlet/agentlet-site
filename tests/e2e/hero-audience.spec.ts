import { expect, test, type Page } from '@playwright/test';

/**
 * The audience tabs under the home page headline (Hero.astro,
 * src/scripts/hero-audience.ts). Rotation timing is driven with Playwright's
 * fake clock: install it before navigating, then pause it at a known time and
 * advance it explicitly, so no test waits for real seconds.
 */

const HEADLINE = 'Augment the web apps you cannot change.';

const AUDIENCES = [
	{
		id: 'business',
		tab: 'Business',
		text: 'Add a side panel with Excel export, form filling and AI to the internal apps your team already uses, without waiting for the vendor or a project.',
	},
	{
		id: 'developers',
		tab: 'Developers',
		text: 'A small TypeScript framework for page-specific tools: module lifecycle, side panel, forms, tables, screenshots and AI helpers. Ship it as a bookmarklet, an extension or a script tag.',
	},
	{
		id: 'it-security',
		tab: 'IT and security',
		text: "Runs inside the page with the user's own session and permissions. No backend change, no telemetry, and nothing leaves the page unless your agentlet sends it.",
	},
	{
		id: 'ai-builders',
		tab: 'AI builders',
		text: "Hand a model the page's forms and tables as clean data, then fill the answer back in. Keep your provider key on your server behind a proxy.",
	},
] as const;

const ROTATE_MS = 8000;
const START = new Date('2026-01-01T00:00:00Z');

/** Opens the home page with a fake clock and freezes it right after load. The
 * first rotation was armed when the script ran, a fraction of a second before
 * the freeze, so it is due about 8 s after this point (the tests leave a few
 * seconds of margin for a slow load). */
async function openWithClock(page: Page): Promise<void> {
	await page.clock.install({ time: START });
	await page.goto('/');
	await expect(page.locator('[data-hero-audience].is-enhanced')).toBeAttached();
	const now = await page.evaluate(() => Date.now());
	await page.clock.pauseAt(new Date(now + 200));
}

function tab(page: Page, id: string) {
	return page.locator(`#hero-audience-tab-${id}`);
}

async function expectActive(page: Page, id: string): Promise<void> {
	const entry = AUDIENCES.find((audience) => audience.id === id);
	if (!entry) throw new Error(`unknown audience ${id}`);
	for (const audience of AUDIENCES) {
		await expect(tab(page, audience.id)).toHaveAttribute('aria-selected', String(audience.id === id));
	}
	const panel = page.locator('.hero-audience [role="tabpanel"]');
	await expect(panel).toHaveAttribute('aria-labelledby', `hero-audience-tab-${id}`);
	await expect(panel.locator('.hero-audience-message.is-active .hero-audience-message-text')).toHaveText(entry.text);
	// Once the cross-fade is over, only the active message is rendered (the
	// others are invisible, so also out of the accessibility tree).
	for (const audience of AUDIENCES) {
		const message = panel.locator(`.hero-audience-message[data-audience="${audience.id}"]`);
		if (audience.id === id) await expect(message).toBeVisible();
		else await expect(message).toBeHidden();
	}
}

test.describe('Hero audience tabs', () => {
	test('the headline, title and social titles use the new wording', async ({ page, request }) => {
		await page.goto('/');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);

		const title = 'agentlet: augment the web apps you cannot change';
		await expect(page).toHaveTitle(title);
		await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title);
		await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute('content', title);
		for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
			const content = (await page.locator(selector).getAttribute('content')) ?? '';
			expect(content).not.toContain('A side panel for web apps');
			expect(content).toContain('side panel');
		}

		const html = await (await request.get('/')).text();
		expect(html).toContain(HEADLINE);
		expect(html).not.toContain('A side panel for web apps you cannot change');
	});

	test('the default tab is Business, first in the tab order', async ({ page }) => {
		await page.goto('/');
		const hero = page.locator('.hero');
		await expect(hero.getByRole('tab')).toHaveText(AUDIENCES.map((audience) => audience.tab));
		await expectActive(page, 'business');
		await expect(hero.getByRole('tabpanel')).toContainText('side panel');
		// Only the selected tab is in the tab order (roving tabindex).
		await expect(tab(page, 'business')).toHaveAttribute('tabindex', '0');
		await expect(tab(page, 'developers')).toHaveAttribute('tabindex', '-1');
		await expect(tab(page, 'business')).toHaveAttribute('aria-controls', 'hero-audience-panel');
	});

	test('does not use aria-live on the rotating text', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('.hero-audience [aria-live]')).toHaveCount(0);
		await expect(page.locator('.hero-audience[aria-live]')).toHaveCount(0);
	});

	test('all four messages are in the server HTML, and readable without JavaScript', async ({ browser }) => {
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto('/');

		const messages = page.locator('.hero-audience-message-text');
		await expect(messages).toHaveText(AUDIENCES.map((audience) => audience.text));
		for (const message of await messages.all()) await expect(message).toBeVisible();
		// The tabs would do nothing without JS, so they are hidden.
		await expect(page.locator('.hero-audience-tabs')).toBeHidden();
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADLINE);
		await context.close();
	});

	test('clicking a tab switches the panel and stops the rotation for good', async ({ page }) => {
		await openWithClock(page);
		await tab(page, 'it-security').click();
		await expectActive(page, 'it-security');

		await page.clock.runFor(ROTATE_MS * 5);
		await expectActive(page, 'it-security');
		await expect(page.locator('[data-hero-audience]')).toHaveAttribute('data-rotating', 'false');

		await tab(page, 'developers').click();
		await expectActive(page, 'developers');
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'developers');
	});

	test('arrow keys, Home and End move between tabs', async ({ page }) => {
		await page.goto('/');
		await tab(page, 'business').focus();

		await page.keyboard.press('ArrowRight');
		await expectActive(page, 'developers');
		await expect(tab(page, 'developers')).toBeFocused();

		await page.keyboard.press('ArrowRight');
		await expectActive(page, 'it-security');

		await page.keyboard.press('End');
		await expectActive(page, 'ai-builders');
		await expect(tab(page, 'ai-builders')).toBeFocused();

		await page.keyboard.press('ArrowRight');
		await expectActive(page, 'business');

		await page.keyboard.press('ArrowLeft');
		await expectActive(page, 'ai-builders');

		await page.keyboard.press('Home');
		await expectActive(page, 'business');
	});

	test('keyboard focus inside the tablist stops the rotation', async ({ page }) => {
		await openWithClock(page);
		await tab(page, 'business').focus();
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'business');
	});

	test('rotates to the next tab every 8 seconds and wraps around', async ({ page }) => {
		await openWithClock(page);
		await expectActive(page, 'business');

		await page.clock.runFor(ROTATE_MS - 3000);
		await expectActive(page, 'business');
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'developers');

		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'it-security');
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'ai-builders');
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'business');
		await expect(page.locator('[data-hero-audience]')).toHaveAttribute('data-rotating', 'true');
	});

	test('holds still while the pointer is over the hero copy, then resumes', async ({ page }) => {
		await openWithClock(page);
		await page.locator('.hero-copy h1').hover();
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'business');

		await page.mouse.move(2, 2);
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'developers');
	});

	test('holds still while the page is hidden, then resumes', async ({ page }) => {
		await openWithClock(page);
		const setVisibility = (state: 'hidden' | 'visible') =>
			page.evaluate((value) => {
				Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
				document.dispatchEvent(new Event('visibilitychange'));
			}, state);

		await setVisibility('hidden');
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'business');

		await setVisibility('visible');
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'developers');
	});

	test('the Pause animations toggle stops the rotation and releasing it resumes', async ({ page }) => {
		await openWithClock(page);
		const toggle = page.locator('#animations-toggle');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'business');

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await page.clock.runFor(ROTATE_MS);
		await expectActive(page, 'developers');
	});

	test('starting with animations paused never rotates', async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('agentlet-animations', 'paused'));
		await openWithClock(page);
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'business');
	});

	test('releasing the pause toggle does not restart a rotation the visitor stopped', async ({ page }) => {
		await openWithClock(page);
		await tab(page, 'developers').click();
		const toggle = page.locator('#animations-toggle');
		await toggle.click();
		await toggle.click();
		await page.clock.runFor(ROTATE_MS * 3);
		await expectActive(page, 'developers');
	});

	test('switching tabs does not change the height of the copy block', async ({ page }) => {
		await page.goto('/');
		const measure = async () =>
			page.evaluate(() => {
				const height = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? -1;
				return {
					panel: height('.hero-audience-panel'),
					copy: height('.hero-copy'),
					hero: height('.hero'),
					scrollY: window.scrollY,
				};
			});

		const first = await measure();
		for (const audience of AUDIENCES) {
			await tab(page, audience.id).click();
			await expectActive(page, audience.id);
			expect(await measure()).toEqual(first);
		}
	});

	test('on a phone the tabs fit and the page does not scroll sideways', async ({ browser }) => {
		const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
		const page = await context.newPage();
		await page.goto('/');

		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
		expect(overflow).toBeLessThanOrEqual(0);
		for (const audience of AUDIENCES) {
			const box = await tab(page, audience.id).boundingBox();
			expect(box).not.toBeNull();
			expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
		}
		await tab(page, 'ai-builders').click();
		await expectActive(page, 'ai-builders');
		await context.close();
	});
});
