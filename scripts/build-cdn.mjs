#!/usr/bin/env node
/**
 * Builds everything served under /cdn/v1/, plus the tiny cross-page
 * bootstrap script, from src/agentlets/manifest.ts, the single source of
 * truth for which agentlets exist.
 *
 * Output:
 *   public/cdn/v1/agentlet-core.min.js   copied from node_modules/agentlet-core
 *   public/cdn/v1/pdf.worker.min.mjs     copied from node_modules/pdfjs-dist
 *                                          (not part of the agentlet-core
 *                                          tarball, see docs/deploy.md notes
 *                                          in the build report)
 *   public/cdn/v1/agentlets/<id>.js      one esbuild IIFE bundle per manifest entry
 *   public/cdn/v1/agentlets-registry.js  generated registry, agentlet-core's
 *                                          script-injection format
 *   public/scripts/agentlet-bootstrap.js esbuild bundle of
 *                                          src/scripts/agentlet-bootstrap.ts
 *
 * None of this is committed: public/cdn/v1/ and public/scripts/ are
 * gitignored, and this script rebuilds them from scratch every run.
 * package.json's "prebuild"/"predev" hooks call it automatically, so both
 * `npm run build` and `npm run dev` produce a working /cdn/v1/ with no
 * separate manual step.
 *
 * Usage: node scripts/build-cdn.mjs
 */

import { build, buildSync } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENTLETS_SRC = join(ROOT, 'src/agentlets');
const CDN_OUT = join(ROOT, 'public/cdn/v1');
const SCRIPTS_OUT = join(ROOT, 'public/scripts');

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

function copyCoreAssets() {
	const coreMin = join(ROOT, 'node_modules/agentlet-core/dist/agentlet-core.min.js');
	const worker = join(ROOT, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs');
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
 * only reads `name`/`url`/`module` from each entry; the extra
 * `description`/`audience` fields are ignored by the core and read directly
 * by the launcher (src/agentlets/launcher.ts) instead, from its own bundled
 * copy of manifest.ts, so they are included here mainly so the generated
 * registry file itself documents the full picture.
 */
function buildRegistry(manifest) {
	const agentlets = manifest.map((entry) => ({
		name: entry.id,
		url: `/cdn/v1/agentlets/${entry.id}.js`,
		module: entry.className,
		description: entry.description,
		...(entry.audience ? { audience: entry.audience } : {}),
	}));

	const contents = `// Generated by scripts/build-cdn.mjs from src/agentlets/manifest.ts.
// Do not edit by hand; edit the manifest and rebuild instead.
//
// Format: agentlet-core's registry script contract. See
// /docs/guides/script-injection/ and agentlet-core's ModuleRegistry.
(function () {
	'use strict';
	var registry = ${JSON.stringify({ agentlets }, null, 2)};
	var event = new CustomEvent('agentletRegistryLoaded', { detail: registry });
	setTimeout(function () {
		window.dispatchEvent(event);
	}, 10);
})();
`;
	writeFileSync(join(CDN_OUT, 'agentlets-registry.js'), contents, 'utf8');
}

async function buildBootstrap() {
	mkdirSync(SCRIPTS_OUT, { recursive: true });
	await build({
		entryPoints: [join(ROOT, 'src/scripts/agentlet-bootstrap.ts')],
		bundle: true,
		minify: true,
		format: 'esm',
		platform: 'browser',
		target: 'es2020',
		outfile: join(SCRIPTS_OUT, 'agentlet-bootstrap.js'),
		logLevel: 'warning',
	});
}

async function main() {
	rmSync(CDN_OUT, { recursive: true, force: true });
	rmSync(SCRIPTS_OUT, { recursive: true, force: true });
	mkdirSync(CDN_OUT, { recursive: true });

	const manifest = await loadManifest();
	copyCoreAssets();
	await buildAgentletBundles(manifest);
	buildRegistry(manifest);
	await buildBootstrap();

	console.log(
		`Built /cdn/v1/ (${manifest.length} agentlet bundle(s): ${manifest.map((e) => e.id).join(', ')}) and /scripts/agentlet-bootstrap.js`,
	);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
