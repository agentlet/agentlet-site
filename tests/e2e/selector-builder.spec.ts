import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

/**
 * Unit tests for the pure buildRobustSelector() function
 * (src/agentlets/selector-builder.ts), not for the selector-workshop demo
 * itself (see selector-workshop.spec.ts for that). No site build or dev
 * server is needed: esbuild (already a devDependency, used by
 * scripts/build-cdn.mjs) bundles the module into an IIFE exposing it on
 * `window`, injected into a blank Playwright page whose DOM is built by
 * hand for each case, so this exercises the function against a real
 * browser DOM without depending on any page this site serves.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(__dirname, '../../src/agentlets/selector-builder.ts');

let bundledCode: string;

test.beforeAll(async () => {
	const result = await build({
		entryPoints: [ENTRY],
		bundle: true,
		write: false,
		format: 'iife',
		globalName: 'SelectorBuilder',
		platform: 'browser',
		target: 'es2020',
	});
	bundledCode = result.outputFiles[0].text;
});

test.describe('buildRobustSelector()', () => {
	test('prefers a unique id over anything else', async ({ page }) => {
		await page.setContent('<div id="app"><button id="save" class="btn btn-primary" data-testid="save-button">Save</button></div>');
		await page.addScriptTag({ content: bundledCode });

		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.getElementById('save') as Element,
			),
		);
		expect(selector).toBe('#save');
		expect(await page.evaluate((sel) => document.querySelectorAll(sel).length, selector)).toBe(1);
	});

	test('ignores a duplicate id and falls through to a stable attribute', async ({ page }) => {
		await page.setContent(`
			<div>
				<button id="dup" name="confirm">One</button>
				<button id="dup" data-action="submit">Two</button>
			</div>
		`);
		await page.addScriptTag({ content: bundledCode });

		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelectorAll('#dup')[1],
			),
		);
		expect(selector).toBe('button[data-action="submit"]');
	});

	test('prefers a data-* attribute, then name, then aria-label, in that order', async ({ page }) => {
		await page.setContent(`
			<input data-testid="email-input" name="email" aria-label="Email address" />
		`);
		await page.addScriptTag({ content: bundledCode });
		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelector('input') as Element,
			),
		);
		expect(selector).toBe('input[data-testid="email-input"]');
	});

	test('falls back to name when no data-* attribute is unique', async ({ page }) => {
		await page.setContent(`<input name="email" aria-label="Email address" />`);
		await page.addScriptTag({ content: bundledCode });
		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelector('input') as Element,
			),
		);
		expect(selector).toBe('input[name="email"]');
	});

	test('builds a short class selector when no id or stable attribute exists', async ({ page }) => {
		await page.setContent(`
			<ul>
				<li class="item">A</li>
			</ul>
		`);
		await page.addScriptTag({ content: bundledCode });
		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelector('li') as Element,
			),
		);
		expect(selector).toBe('li.item');
	});

	test('adds :nth-of-type only when a sibling shares the same tag and classes', async ({ page }) => {
		await page.setContent(`
			<ul>
				<li class="item">A</li>
				<li class="item">B</li>
				<li class="other">C</li>
			</ul>
		`);
		await page.addScriptTag({ content: bundledCode });

		const selectors = await page.evaluate(() => {
			const helper = (window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder;
			return Array.from(document.querySelectorAll('li')).map((li) => helper.buildRobustSelector(li));
		});

		expect(selectors).toEqual(['li.item:nth-of-type(1)', 'li.item:nth-of-type(2)', 'li.other']);
		// Each selector must resolve back to exactly the element it was built for.
		const uniqueCounts = await page.evaluate((sels) => sels.map((sel) => document.querySelectorAll(sel).length), selectors);
		expect(uniqueCounts).toEqual([1, 1, 1]);
	});

	test('climbs to a parent when the element itself cannot be disambiguated alone', async ({ page }) => {
		await page.setContent(`
			<section id="one"><span class="tag">x</span></section>
			<section id="two"><span class="tag">x</span></section>
		`);
		await page.addScriptTag({ content: bundledCode });

		const selectors = await page.evaluate(() => {
			const helper = (window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder;
			return Array.from(document.querySelectorAll('.tag')).map((span) => helper.buildRobustSelector(span));
		});

		// "span.tag" alone matches both; the shortest unique selector adds
		// the id'd ancestor rather than falling back to a full nth-of-type
		// path from <html>, since #one and #two are each unique on their own.
		expect(selectors).toEqual(['#one > span.tag', '#two > span.tag']);
	});

	test('never crosses into an ancestor with an id when a shorter unique selector already exists', async ({ page }) => {
		await page.setContent(`<div id="app"><p class="lead">Hello</p></div>`);
		await page.addScriptTag({ content: bundledCode });
		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelector('.lead') as Element,
			),
		);
		expect(selector).toBe('p.lead');
	});

	test('ignores "agentlet-" prefixed classes, which belong to this demo\'s own UI', async ({ page }) => {
		await page.setContent(`<div><button class="agentlet-try-button primary-action">Go</button></div>`);
		await page.addScriptTag({ content: bundledCode });
		const selector = await page.evaluate(() =>
			(window as unknown as { SelectorBuilder: { buildRobustSelector: (el: Element) => string } }).SelectorBuilder.buildRobustSelector(
				document.querySelector('button') as Element,
			),
		);
		expect(selector).toBe('button.primary-action');
	});
});
