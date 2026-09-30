/**
 * Loads a plain TypeScript module (no JSX, no decorators) into a Node build
 * script. The build scripts are not part of the Astro and Vite pipeline, so
 * they have no TypeScript loader of their own: this bundles the file with
 * esbuild (already a dependency) into a throwaway file under node_modules
 * and imports the result, rather than depending on Node's own experimental
 * TypeScript support.
 */

import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/**
 * @param {string} entryPoint Absolute path of the .ts file.
 * @param {string} tempName File name for the throwaway bundle, unique per caller.
 * @returns {Promise<Record<string, unknown>>} The module's exports.
 */
export async function loadTsModule(entryPoint, tempName) {
	const outfile = join(ROOT, 'node_modules', tempName);
	buildSync({
		entryPoints: [entryPoint],
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
	return mod;
}
