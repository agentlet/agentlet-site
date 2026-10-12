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

		const toggle = page.locator('#animations-toggle');
		await expect(toggle).toHaveAccessibleName('Pause animations');
		await toggle.click();
		await expect(toggle).toHaveAccessibleName('Play animations');
		await expect.poll(() => pausedStates(page)).toEqual([true, true]);
		await expect(videos.first()).toBeHidden();
		await expect(page.locator('.demo-media-still').first()).toBeVisible();

		await toggle.click();
		await expect(toggle).toHaveAccessibleName('Pause animations');
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
		await expect(page.locator('#animations-toggle')).toHaveAccessibleName('Play animations');
	});
});

test.describe('Paused state: play control over the demo videos and the header label', () => {
	// The visible word on the header toggle ("Pause" or "Play"); the rest of
	// its accessible name is visually hidden text in .animations-toggle-extra.
	const toggleLabel = (page: Page) =>
		page.locator('#animations-toggle .animations-toggle-label:visible').evaluate((label) => {
			const copy = label.cloneNode(true) as HTMLElement;
			copy.querySelector('.animations-toggle-extra')?.remove();
			return copy.textContent;
		});

	async function openPaused(page: Page): Promise<void> {
		// Stored, then reloaded (not an init script, which would re-pause on every later reload).
		await page.goto('/');
		await page.evaluate((key) => localStorage.setItem(key, 'paused'), ANIMATIONS_KEY);
		await page.reload();
		await page.waitForLoadState('load');
	}

	test('while playing, no play control is shown over the videos', async ({ page }) => {
		await page.goto('/');
		const overlays = page.locator('.demo-play');
		await expect(overlays).toHaveCount(2);
		for (const overlay of await overlays.all()) await expect(overlay).toBeHidden();
	});

	test('while paused, each video has a labelled play control over its still frame', async ({ page }) => {
		await openPaused(page);
		const media = page.locator('.demo-media');
		await expect(media).toHaveCount(2);
		for (const item of await media.all()) {
			await item.scrollIntoViewIfNeeded();
			const play = item.getByRole('button', { name: 'Play animations' });
			await expect(play).toBeVisible();
			await expect(item.locator('.demo-media-still')).toBeVisible();

			// Same box as the media: nothing shifts, and the control is centred.
			const box = await item.boundingBox();
			const icon = await play.locator('.demo-play-icon').boundingBox();
			const playBox = await play.boundingBox();
			expect(playBox).toEqual(box);
			expect(Math.abs((icon!.x + icon!.width / 2) - (box!.x + box!.width / 2))).toBeLessThan(2);
		}
	});

	test('the play control is reachable and operable from the keyboard', async ({ page }) => {
		await openPaused(page);
		const play = page.locator('.demo-play').first();
		await play.scrollIntoViewIfNeeded();
		await play.focus();
		await expect(play).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(play).toBeHidden();
		await expect.poll(() => pausedStates(page)).toEqual([false, false]);
		// Focus moves to the video, not to the top of the document.
		await expect(page.locator('.demo-media-video').first()).toBeFocused();
	});

	test('clicking it resumes everything and persists the choice', async ({ page }) => {
		await openPaused(page);
		const toggle = page.locator('#animations-toggle');
		await expect(toggle).toHaveAccessibleName('Play animations');
		expect(await toggleLabel(page)).toBe('Play');

		const play = page.locator('.demo-play').first();
		await play.scrollIntoViewIfNeeded();
		await play.click();

		await expect(page.locator('html')).toHaveAttribute('data-animations', 'playing');
		for (const overlay of await page.locator('.demo-play').all()) await expect(overlay).toBeHidden();
		await expect.poll(() => pausedStates(page)).toEqual([false, false]);
		await expect(page.locator('.demo-media-video').first()).toBeVisible();
		await expect(page.locator('.demo-media-still').first()).toBeHidden();
		await expect(toggle).toHaveAccessibleName('Pause animations');
		await expect(toggle).toHaveAttribute('title', 'Pause animations');
		expect(await toggleLabel(page)).toBe('Pause');
		expect(await page.evaluate((key) => localStorage.getItem(key), ANIMATIONS_KEY)).toBe('playing');

		// A reload keeps playing.
		await page.reload();
		await expect(page.locator('html')).toHaveAttribute('data-animations', 'playing');
		for (const overlay of await page.locator('.demo-play').all()) await expect(overlay).toBeHidden();
	});

	test('the header toggle shows "Pause" while playing and "Play" while paused', async ({ page }) => {
		await page.goto('/');
		const toggle = page.locator('#animations-toggle');
		expect(await toggleLabel(page)).toBe('Pause');
		await expect(toggle).toHaveAttribute('title', 'Pause animations');
		await toggle.click();
		expect(await toggleLabel(page)).toBe('Play');
		await expect(toggle).toHaveAttribute('title', 'Play animations');
		expect(await page.evaluate((key) => localStorage.getItem(key), ANIMATIONS_KEY)).toBe('paused');
		// The overlay appears as soon as the header toggle pauses.
		await expect(page.locator('.demo-play').first()).toBeVisible();
	});

	test('resuming from the play control restarts the hero story', async ({ page }) => {
		await openPaused(page);
		const story = page.locator('[data-story]').first();
		const storyToggle = story.locator('[data-story-toggle]');
		await expect(storyToggle).toHaveAccessibleName('Play animation');
		await expect(story.locator('.scene')).not.toHaveClass(/force-playing/);

		const play = page.locator('.demo-play').first();
		await play.scrollIntoViewIfNeeded();
		await play.click();
		await expect(storyToggle).toHaveAccessibleName('Pause animation');

		// With the hero back in view, the step timer advances again.
		await story.scrollIntoViewIfNeeded();
		const step = story.locator('.scene');
		const first = await step.getAttribute('data-step');
		await expect.poll(() => step.getAttribute('data-step'), { timeout: 20_000 }).not.toBe(first);
	});

	for (const state of ['playing', 'paused']) {
		test(`the page does not overflow horizontally at 390px while ${state}`, async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [ANIMATIONS_KEY, state]);
			await page.goto('/');
			await page.waitForLoadState('load');
			await expect(page.locator('html')).toHaveAttribute('data-animations', state);
			const overflow = await page.evaluate(() => {
				const wrap = document.querySelector('.site-header .wrap') as HTMLElement;
				return {
					scroll: document.documentElement.scrollWidth,
					client: document.documentElement.clientWidth,
					header: wrap.scrollWidth - wrap.clientWidth,
				};
			});
			expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);
			expect(overflow.header).toBeLessThanOrEqual(0);
			// Whatever the label does to fit, the accessible name stays.
			await expect(page.locator('#animations-toggle')).toHaveAccessibleName(
				state === 'paused' ? 'Play animations' : 'Pause animations',
			);
			await expect(page.locator('#animations-toggle')).toHaveAttribute(
				'title',
				state === 'paused' ? 'Play animations' : 'Pause animations',
			);
		});
	}
});
