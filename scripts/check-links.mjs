// Fails when a built page links to an internal path that does not exist in
// the build output. starlight-links-validator only covers the docs content;
// this also covers the landing page, the layouts and the components.
//
// Usage: node scripts/check-links.mjs [dist]

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] ?? 'dist';

/** @param {string} dir @returns {string[]} */
function htmlFiles(dir) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return htmlFiles(path);
		return entry.name.endsWith('.html') ? [path] : [];
	});
}

// Sources of `_redirects` rules count as valid targets.
const redirectSources = new Set();
const redirectsFile = join(root, '_redirects');
if (existsSync(redirectsFile)) {
	for (const line of readFileSync(redirectsFile, 'utf8').split('\n')) {
		const source = line.trim().split(/\s+/)[0];
		if (source && !source.startsWith('#')) redirectSources.add(source);
	}
}

/** @param {string} urlPath @returns {boolean} */
function exists(urlPath) {
	if (redirectSources.has(urlPath)) return true;
	const file = join(root, decodeURIComponent(urlPath));
	if (urlPath.endsWith('/')) return existsSync(join(file, 'index.html'));
	if (existsSync(file) && statSync(file).isFile()) return true;
	return existsSync(join(file, 'index.html')) || existsSync(`${file}.html`);
}

const problems = [];
for (const file of htmlFiles(root)) {
	const html = readFileSync(file, 'utf8');
	// Only attributes of real tags: code samples shown as text start with an
	// escaped `&lt;` and are ignored.
	for (const match of html.matchAll(/<[a-zA-Z][^<>]*?\s(?:href|src)="(\/[^"]*)"/g)) {
		const target = match[1];
		if (target.startsWith('//')) continue;
		const path = target.split('#')[0].split('?')[0];
		if (path && !exists(path)) problems.push(`${file}: ${target}`);
	}
}

if (problems.length > 0) {
	console.error(`Broken internal links:\n${[...new Set(problems)].join('\n')}`);
	process.exit(1);
}
console.log(`Internal links check passed for ${root}.`);
