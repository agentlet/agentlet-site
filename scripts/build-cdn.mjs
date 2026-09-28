#!/usr/bin/env node
/**
 * Builds everything served under /cdn/v1/, the only path the live demo
 * downloads anything from, from src/agentlets/manifest.ts, the single
 * source of truth for which agentlets exist.
 *
 * Output:
 *   public/cdn/v1/agentlet-core.min.js   copied from node_modules/agentlet-core
 *   public/cdn/v1/pdf.worker.min.mjs     copied from node_modules/agentlet-core
 *                                          (agentlet-core 2.1.0 ships the
 *                                          matching pdf.js worker directly,
 *                                          see copyCoreAssets() below)
 *   public/cdn/v1/agentlets/<id>.js      one esbuild IIFE bundle per manifest entry
 *   public/cdn/v1/agentlets-registry.js  generated registry, agentlet-core's
 *                                          script-injection format
 *   public/cdn/v1/demo-loader.js         esbuild bundle of
 *                                          src/scripts/demo-loader.ts, at the
 *                                          path LOADER_URL in
 *                                          src/scripts/agentlet-inline-snippets.mjs
 *
 * None of this is committed: public/cdn/v1/ is gitignored, and this script
 * rebuilds it from scratch every run. package.json's "prebuild"/"predev"
 * hooks call it automatically, so both `npm run build` and `npm run dev`
 * produce a working /cdn/v1/ with no separate manual step.
 *
 * Usage: node scripts/build-cdn.mjs
 */

import { build, buildSync } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOADER_URL } from '../src/scripts/agentlet-inline-snippets.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENTLETS_SRC = join(ROOT, 'src/agentlets');
const CDN_OUT = join(ROOT, 'public/cdn/v1');
// LOADER_URL is a site-root path (e.g. "/cdn/v1/demo-loader.js"); public/
// mirrors the site root, so stripping the leading slash gives its on-disk
// location under public/.
const LOADER_OUT = join(ROOT, 'public', LOADER_URL.replace(/^\//, ''));

/**
 * src/agentlets/manifest.ts is plain TypeScript (interfaces and a couple of
 * arrays/functions, no JSX, no decorators), but this is a Node build
 * script, not part of the Astro/Vite pipeline, so it has no TypeScript
 * loader of its own. Transform it with esbuild (already a dependency for
 * the agentlet bundles below) and import the result from a throwaway file,
 * rather than depending on Node's own experimental TypeScript support.
 */
async function loadManifest() {
	const outfile = join(ROOT, 'node_modules/.agentlet-manifest.generated.mjs');
	buildSync({
		entryPoints: [join(AGENTLETS_SRC, 'manifest.ts')],
		bundle: true,
		write: true,
		outfile,
		format: 'esm',
		platform: 'neutral',
		target: 'es2022',
		logLevel: 'warning',
	});
	const mod = await import(pathToFileURL(outfile).href);
	rmSync(outfile, { force: true });
	return mod.AGENTLET_MANIFEST;
}

/**
 * Both files come straight from the agentlet-core package, matched by
 * construction: agentlet-core 2.1.0 ships `dist/pdf.worker.min.mjs`
 * alongside `dist/agentlet-core.min.js`, built from the exact pdfjs-dist
 * version it bundles, so there is no separate version to track or pin here.
 */
function copyCoreAssets() {
	const coreMin = join(ROOT, 'node_modules/agentlet-core/dist/agentlet-core.min.js');
	const worker = join(ROOT, 'node_modules/agentlet-core/dist/pdf.worker.min.mjs');
	for (const file of [coreMin, worker]) {
		if (!existsSync(file)) {
			throw new Error(`Missing ${file}. Run npm install first.`);
		}
	}
	copyFileSync(coreMin, join(CDN_OUT, 'agentlet-core.min.js'));
	copyFileSync(worker, join(CDN_OUT, 'pdf.worker.min.mjs'));
}

/**
 * One IIFE bundle per manifest entry. `bundle: true` pulls in each agentlet's
 * own small dependencies (for example src/agentlets/shared.ts and
 * manifest.ts), but never agentlet-core itself: every agentlet file only
 * ever imports `type`-only declarations from the `agentlet-core` package
 * (erased at build time) and extends `window.agentlet.Module` at runtime,
 * the global the core sets up before this bundle is loaded. No `external`
 * option is therefore needed to keep the core out of the bundle.
 */
async function buildAgentletBundles(manifest) {
	mkdirSync(join(CDN_OUT, 'agentlets'), { recursive: true });
	for (const entry of manifest) {
		await build({
			entryPoints: [join(AGENTLETS_SRC, `${entry.file}.ts`)],
			bundle: true,
			minify: true,
			format: 'iife',
			platform: 'browser',
			target: 'es2020',
			outfile: join(CDN_OUT, 'agentlets', `${entry.id}.js`),
			logLevel: 'warning',
		});
	}
}

/**
 * agentlet-core's registry contract (see /docs/guides/script-injection/ and
 * agentlet-core src/core/ModuleRegistry.ts): a script that builds a
 * registry object and dispatches it via `agentletRegistryLoaded`, so it
 * loads through `<script src>` injection rather than `fetch()` and works
 * across origins and behind a strict CSP. `ModuleRegistry.loadAgentletModule()`
 * reads `name`/`url`/`module`/`lazy` from each entry; the extra
 * `description`/`audience` fields are ignored by the core and read directly
 * by the launcher (src/agentlets/launcher.ts) instead, from its own bundled
 * copy of manifest.ts, so they are included here mainly so the generated
 * registry file itself documents the full picture.
 *
 * `lazy: true` (driven by the manifest entry's own `lazy` field, see
 * manifest.ts) makes `ModuleRegistry.initialize()` skip loading that entry's
 * bundle at startup; the launcher loads it on demand instead, the first
 * time its "Try it" button is clicked, via `moduleRegistry.loadModule()`.
 *
 * The event dispatches synchronously, in the same task as the script's own
 * execution, rather than after the `setTimeout(..., 10)` the framework's own
 * docs example uses "to ensure the event listener is set up". That listener
 * is actually attached by `ModuleRegistry.loadRegistryScript()` before the
 * `<script>` element is even created, so the delay was never load-bearing
 * for correctness, only a defensive habit copied from the example. On a
 * heavier page (Starlight's docs pages run more JS than the landing page:
 * Pagefind's index, its search UI, and this project's own launcher/demo
 * scripts on top), the main thread can stay busy long enough after this
 * script's `onload` fires that a queued `setTimeout` callback is delayed
 * past `ModuleRegistry`'s fixed 10 second timeout, so the registry never
 * arrives and the core logs "Registry loading timeout after 10000ms" with
 * zero modules registered. Dispatching synchronously removes that timer
 * from the picture entirely: the event fires deterministically, inside the
 * same script evaluation agentlet-core already waited for via `onload`.
 */
function buildRegistry(manifest) {
	const agentlets = manifest.map((entry) => ({
		name: entry.id,
		url: `/cdn/v1/agentlets/${entry.id}.js`,
		module: entry.className,
		description: entry.description,
		...(entry.audience ? { audience: entry.audience } : {}),
		...(entry.lazy ? { lazy: true } : {}),
	}));

	const contents = `// Generated by scripts/build-cdn.mjs from src/agentlets/manifest.ts.
// Do not edit by hand; edit the manifest and rebuild instead.
//
// Format: agentlet-core's registry script contract. See
// /docs/guides/script-injection/ and agentlet-core's ModuleRegistry.
// Dispatches synchronously; see the comment on buildRegistry() in
// scripts/build-cdn.mjs for why this does not use a setTimeout.
(function () {
	'use strict';
	var registry = ${JSON.stringify({ agentlets }, null, 2)};
	window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry }));
})();
`;
	writeFileSync(join(CDN_OUT, 'agentlets-registry.js'), contents, 'utf8');
}

async function buildLoader() {
	mkdirSync(dirname(LOADER_OUT), { recursive: true });
	await build({
		entryPoints: [join(ROOT, 'src/scripts/demo-loader.ts')],
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2020',
		outfile: LOADER_OUT,
		logLevel: 'warning',
	});
}

async function main() {
	rmSync(CDN_OUT, { recursive: true, force: true });
	mkdirSync(CDN_OUT, { recursive: true });

	const manifest = await loadManifest();
	copyCoreAssets();
	await buildAgentletBundles(manifest);
	buildRegistry(manifest);
	await buildLoader();

	console.log(
		`Built /cdn/v1/ (${manifest.length} agentlet bundle(s): ${manifest.map((e) => e.id).join(', ')}, plus the demo loader at ${LOADER_URL})`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
