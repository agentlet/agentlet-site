import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const ANIMATIONS_KEY = 'agentlet-animations';

async function pausedStates(page: Page): Promise<boolean[]> {
	return page.locator('.demo-media-video').evaluateAll((videos) => videos.map((video) => (video as HTMLVideoElement).paused));
}

test.describe('Demo videos and the "Pause animations" toggle', () => {
	test('serves two videos with posters and no GIFs', async ({ page }) => {
		const gifRequests: string[] = [];
		page.on('request', (request) => {
			if (request.url().endsWith('.gif')) gifRequests.push(request.url());
		});

		await page.goto('/');
		await page.waitForLoadState('load');

		// Not 'networkidle': a looping video keeps fetching ranges, so the network never idles.
		const videos = page.locator('.demo-media-video');
		await expect(videos).toHaveCount(2);
		for (const video of await videos.all()) {
			await expect(video).toHaveAttribute('poster', /demo-part[12]-still\.png$/);
			await expect(video).toHaveJSProperty('muted', true);
			await expect(video).toHaveJSProperty('loop', true);
			await expect(video.locator('source')).toHaveCount(2);
		}
		expect(gifRequests).toEqual([]);
	});

	test('the videos play, pause with the toggle and resume', async ({ page }) => {
		await page.goto('/');
		const videos = page.locator('.demo-media-video');
		await videos.first().scrollIntoViewIfNeeded();
		await videos.last().scrollIntoViewIfNeeded();

		await expect.poll(() => pausedStates(page)).toEqual([false, false]);
		await expect(page.locator('.demo-media-still').first()).toBeHidden();

		const toggle = page.getByRole('button', { name: 'Pause animations' });
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect.poll(() => pausedStates(page)).toEqual([true, true]);
		await expect(videos.first()).toBeHidden();
		await expect(page.locator('.demo-media-still').first()).toBeVisible();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await expect.poll(() => pausedStates(page)).toEqual([false, false]);
		await expect(videos.first()).toBeVisible();
		await expect(page.locator('.demo-media-still').first()).toBeHidden();
	});

	test('a stored pause choice keeps the videos paused on load', async ({ page }) => {
		await page.addInitScript((key) => {
			localStorage.setItem(key, 'paused');
		}, ANIMATIONS_KEY);
		await page.goto('/');
		await page.waitForLoadState('load');

		await expect.poll(() => pausedStates(page)).toEqual([true, true]);
		await expect(page.locator('.demo-media-video').first()).toBeHidden();
		await expect(page.locator('.demo-media-still').first()).toBeVisible();
		await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveAttribute('aria-pressed', 'true');
	});
});
