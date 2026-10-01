/**
 * Where the build scripts record what each bundle contains, for the
 * dependency vulnerability scan (.github/workflows/security.yml).
 *
 * esbuild metafiles list every source file that went into a bundle,
 * including the packages under node_modules. They are written under
 * reports/security/meta/<group>/, which is gitignored and outside every
 * deployed or published directory (dist/, public/ and the npm package), so
 * nothing here can reach a browser or the npm registry.
 *
 * Groups: cdn (the /cdn/v1/ scripts), known-sites (the @agentlet/demos
 * package), astro (client modules of the site's own pages, see
 * astro.config.mjs).
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

/** Base directory of all metafiles. SBOM_META_DIR overrides it. */
export function metaDir() {
	const dir = process.env.SBOM_META_DIR || 'reports/security/meta';
	return isAbsolute(dir) ? dir : join(ROOT, dir);
}

/** Removes the metafiles of a group, so a build never leaves stale ones. */
export function resetMetafiles(group) {
	rmSync(join(metaDir(), group), { recursive: true, force: true });
}

/**
 * @param {string} group Sub directory: cdn, known-sites or astro.
 * @param {string} name File name without extension.
 * @param {object} metafile An esbuild metafile (or a compatible object).
 */
export function writeMetafile(group, name, metafile) {
	const dir = join(metaDir(), group);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${name}.meta.json`), JSON.stringify(metafile), 'utf8');
}
