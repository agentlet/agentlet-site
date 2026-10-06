#!/usr/bin/env node
/**
 * Builds everything served under /cdn/v1/, the only path the live demo
 * downloads anything from, from src/agentlets/manifest.ts, the single
 * source of truth for which agentlets exist.
 *
 * Output:
 *   public/cdn/v1/agentlet-core.min.js   copied from node_modules/agentlet-core
 *   public/cdn/v1/pdf.worker.min.mjs     copied from node_modules/agentlet-core
 *                                          (agentlet-core 2.3.0 ships the
 *                                          matching pdf.js worker directly,
 *                                          see copyCoreAssets() below)
 *   public/cdn/v1/agentlet-{xlsx,html2canvas,pdfjs}.min.js, cmaps/, standard_fonts/
 *                                        copied from node_modules/agentlet-core
 *                                          when the installed core loads its
 *                                          libraries on demand (2.4.0 or later), see
 *                                          copyCoreAssets() below
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

import { build } from 'esbuild';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModule } from './lib/load-ts-module.mjs';
import { resetMetafiles, writeMetafile } from './lib/metafile.mjs';
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
	const mod = await loadTsModule(join(AGENTLETS_SRC, 'manifest.ts'), '.agentlet-manifest.generated.mjs');
	return mod.AGENTLET_MANIFEST;
}

/**
 * Files an agentlet-core release that loads SheetJS, html2canvas and pdf.js on
 * demand fetches next to the core script: three classic-script chunks, and the
 * pdf.js character maps and standard fonts. 2.3.0 and earlier inline the three
 * libraries and fetch the character maps and fonts from cdnjs instead, so this
 * layout is detected from the installed package rather than assumed.
 */
const CORE_CHUNK_FILES = ['agentlet-xlsx.min.js', 'agentlet-html2canvas.min.js', 'agentlet-pdfjs.min.js'];
const CORE_ASSET_DIRS = ['cmaps', 'standard_fonts'];

/**
 * Everything comes straight from the agentlet-core package, matched by
 * construction: agentlet-core ships `dist/pdf.worker.min.mjs` alongside
 * `dist/agentlet-core.min.js`, built from the exact pdfjs-dist version it
 * bundles, so there is no separate version to track or pin here. The same goes
 * for the on-demand chunks, `cmaps/` and `standard_fonts/`: the core resolves
 * them relative to its own script URL, so serving them in this folder is all
 * the live demo needs, with no `libraryBaseUrl`.
 */
function copyCoreAssets() {
	const coreDist = join(ROOT, 'node_modules/agentlet-core/dist');
	const coreMin = join(coreDist, 'agentlet-core.min.js');
	const worker = join(coreDist, 'pdf.worker.min.mjs');
	for (const file of [coreMin, worker]) {
		if (!existsSync(file)) {
			throw new Error(`Missing ${file}. Run npm install first.`);
		}
	}
	copyFileSync(coreMin, join(CDN_OUT, 'agentlet-core.min.js'));
	copyFileSync(worker, join(CDN_OUT, 'pdf.worker.min.mjs'));

	const inputs = {
		'node_modules/agentlet-core/dist/agentlet-core.min.js': {},
		'node_modules/agentlet-core/dist/pdf.worker.min.mjs': {},
	};

	if (existsSync(join(coreDist, CORE_CHUNK_FILES[0]))) {
		for (const chunk of CORE_CHUNK_FILES) {
			const source = join(coreDist, chunk);
			if (!existsSync(source)) {
				throw new Error(`Missing ${source}. The installed agentlet-core is incomplete, reinstall it.`);
			}
			copyFileSync(source, join(CDN_OUT, chunk));
			inputs[`node_modules/agentlet-core/dist/${chunk}`] = {};
		}
		for (const dir of CORE_ASSET_DIRS) {
			const source = join(coreDist, dir);
			if (!existsSync(source)) {
				throw new Error(`Missing ${source}. The installed agentlet-core is incomplete, reinstall it.`);
			}
			cpSync(source, join(CDN_OUT, dir), { recursive: true });
		}
	}

	// Copied, not bundled by esbuild, so the scan would not see it. Record
	// it by hand, in the esbuild metafile shape, so agentlet-core itself
	// (which is served to browsers) is part of the shipped inventory.
	writeMetafile('cdn', 'agentlet-core-copy', { inputs, outputs: {} });
}

/**
 * One IIFE bundle per manifest entry. `bundle: true` pulls in each agentlet's
 * own small dependencies (for example src/agentlets/shared.ts and
 * manifest.ts), but never agentlet-core itself: every agentlet file only
 * ever imports `type`-only declarations from the `agentlet-core` package
 * (erased at build time) and extends `window.agentlet.Module` at runtime,
 * the global the core sets up before this bundle is loaded. No `external`
 * option is therefore needed to keep the core out of the bundle.
 *
 * A manifest entry's own `fileExt` (currently only white-label.tsx, which
 * mounts a React tree via the mount API) picks a `.tsx` entry point instead
 * of the default `.ts`, the same field src/agentlets/shared.ts's sourceUrl()
 * reads to build a working "View the source of this agentlet" link. `jsx:
 * 'automatic'` makes esbuild inject `react/jsx-runtime` itself for any file
 * that actually contains JSX, bundled the same as any other dependency since
 * React is never external here; it is a no-op for every other, non-JSX
 * module, so nothing else's bundle changes.
 */
async function buildAgentletBundles(manifest) {
	mkdirSync(join(CDN_OUT, 'agentlets'), { recursive: true });
	for (const entry of manifest) {
		const entryPoint = join(AGENTLETS_SRC, `${entry.file}.${entry.fileExt ?? 'ts'}`);
		const result = await build({
			entryPoints: [entryPoint],
			bundle: true,
			minify: true,
			format: 'iife',
			platform: 'browser',
			target: 'es2020',
			jsx: 'automatic',
			outfile: join(CDN_OUT, 'agentlets', `${entry.id}.js`),
			logLevel: 'warning',
			metafile: true,
		});
		writeMetafile('cdn', `agentlet-${entry.id}`, result.metafile);
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
	const result = await build({
		entryPoints: [join(ROOT, 'src/scripts/demo-loader.ts')],
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2020',
		outfile: LOADER_OUT,
		logLevel: 'warning',
		metafile: true,
	});
	writeMetafile('cdn', 'demo-loader', result.metafile);
}

async function main() {
	rmSync(CDN_OUT, { recursive: true, force: true });
	mkdirSync(CDN_OUT, { recursive: true });
	resetMetafiles('cdn');

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
