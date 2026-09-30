#!/usr/bin/env node
/**
 * Serves the locally built `agentlet-demos` package for development, so the
 * known-sites bookmarklet can be tried on real sites before a version is
 * published to npm. Wikipedia's Content Security Policy allows `localhost`,
 * which is what makes this possible.
 *
 * It is a separate small server, not a route of the Astro dev server: Astro's
 * dev server refuses cross-origin subresource requests on purpose (a host
 * site loading a script from it is one), and that protection should stay on
 * for the site itself. Nothing served here is part of the deployed site, so
 * public/_headers needs no CORS rule for it.
 *
 * Routes (all with `Access-Control-Allow-Origin: *`, because agentlet-core
 * loads registries and modules with `crossOrigin = 'anonymous'` from the host
 * site's origin, and `Cache-Control: no-store`):
 *   /loader.js, /registry.js, /agentlets/<id>.js   packages/agentlet-demos/dist/
 *   /cdn/v1/agentlet-core.min.js, /cdn/v1/pdf.worker.min.mjs
 *                                                   node_modules/agentlet-core/dist/
 *                                                   (the loader reads the core from
 *                                                   `/cdn/v1/` of its own origin when it
 *                                                   is not served by jsDelivr)
 *
 * `npm run dev` starts it through astro.config.mjs. To run it alone:
 *   node scripts/build-known-sites.mjs && node scripts/serve-known-sites.mjs
 * Rebuild with `npm run build:known-sites` after editing an agentlet; reload
 * the host page and click the bookmarklet again.
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KNOWN_SITES_DEV_PORT } from '../src/scripts/known-sites-dev.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEMOS_DIST = join(ROOT, 'packages/agentlet-demos/dist');
const CORE_DIST = join(ROOT, 'node_modules/agentlet-core/dist');
const CORE_PREFIX = '/cdn/v1/';
const CORE_FILES = new Set(['agentlet-core.min.js', 'pdf.worker.min.mjs']);
const TYPES = {
	'.js': 'application/javascript; charset=utf-8',
	'.mjs': 'application/javascript; charset=utf-8',
};

function resolveFile(pathname) {
	if (pathname.startsWith(CORE_PREFIX)) {
		const name = pathname.slice(CORE_PREFIX.length);
		return CORE_FILES.has(name) ? join(CORE_DIST, name) : null;
	}
	const file = normalize(join(DEMOS_DIST, pathname));
	return file.startsWith(DEMOS_DIST + '/') ? file : null;
}

/** @returns {import('node:http').Server} */
export function startKnownSitesServer(port = KNOWN_SITES_DEV_PORT) {
	const server = createServer((request, response) => {
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Cache-Control', 'no-store');

		let pathname = '/';
		try {
			pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
		} catch {
			// A malformed URL falls through to the 404 below.
		}

		const file = resolveFile(pathname);
		if (!file || !existsSync(file) || !statSync(file).isFile()) {
			response.statusCode = 404;
			response.end('Not found. Run `node scripts/build-known-sites.mjs` first.');
			return;
		}
		response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
		response.end(readFileSync(file));
	});

	server.on('error', (error) => {
		console.warn(`Known-sites dev server could not start on port ${port}: ${error.message}`);
	});
	server.listen(port, 'localhost', () => {
		console.log(`Known-sites dev server: http://localhost:${port}/loader.js`);
	});
	return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	startKnownSitesServer();
}
