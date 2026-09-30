import { AGENTLET_BASE_STYLES } from '../shared';

/**
 * Helpers shared by every agentlet under src/agentlets/known-sites/. Each
 * bundle includes its own copy (esbuild bundles per entry point, see
 * scripts/build-known-sites.mjs), so this file stays small.
 */

/** Repository path prefix for "View the source of this agentlet" links. */
export const KNOWN_SITES_SOURCE_DIR = 'known-sites';

/**
 * agentlet.io's own page, linked from panels as the place to read more. An
 * absolute URL on purpose: these panels run on other sites, where a
 * root-relative link would point at the host site.
 */
export const KNOWN_SITES_PAGE_URL = 'https://agentlet.io/try/known-sites/';

/**
 * Colour tokens for a panel that runs on a site which does not define
 * agentlet.io's own custom properties. AGENTLET_BASE_STYLES reads
 * `--color-*` with light fallbacks, which is right on agentlet.io but would
 * leave dark-on-dark text in a dark-themed panel elsewhere. Defining the
 * tokens on the panel body itself, for both colour schemes, makes every rule
 * that reads them follow `prefers-color-scheme`, the same signal the loader
 * uses to pick the core's own theme (src/scripts/known-sites-loader.ts).
 * Values mirror LIGHT_THEME and DARK_THEME in src/scripts/agentlet-theme.ts.
 */
const TOKEN_STYLES = `
.agentlet-panel-body {
	--color-text: #3d4f5e;
	--color-heading: #0f3350;
	--color-text-muted: #5b6b78;
	--color-surface: #f4f6f8;
	--color-surface-border: #d9e0e6;
	--color-accent: #f4a261;
	--color-badge-bg: #fde8d7;
	--color-badge-text: #7a3a10;
	--color-primary-bg: #0f3350;
	--color-primary-text: #ffffff;
	--color-primary-bg-hover: #1b4a70;
}

@media (prefers-color-scheme: dark) {
	.agentlet-panel-body {
		--color-text: #e6edf2;
		--color-heading: #ffffff;
		--color-text-muted: #a9b9c6;
		--color-surface: #16293a;
		--color-surface-border: #24394d;
		--color-badge-bg: #3a2a1c;
		--color-badge-text: #f4c9a0;
		--color-primary-bg: #f4a261;
		--color-primary-text: #0f3350;
		--color-primary-bg-hover: #f7b47e;
	}
}
`;

/** Small layout pieces reused by the demo panels. */
const COMMON_STYLES = `
.ks-intro {
	color: var(--color-text-muted);
	font-size: 0.9rem;
}

.ks-actions {
	display: flex;
	align-items: center;
	flex-wrap: wrap;
	gap: 12px;
}

.ks-link-button {
	appearance: none;
	background: none;
	border: none;
	padding: 0;
	font: inherit;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--color-heading);
	text-decoration: underline;
	text-decoration-color: var(--color-accent);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
	cursor: pointer;
}

.ks-link-button:disabled,
.agentlet-try-button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.ks-stats {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.ks-stats li {
	border: 1px solid var(--color-surface-border);
	border-radius: 8px;
	padding: 6px 10px;
	background: var(--color-surface);
	font-size: 0.85rem;
}

.ks-stats strong {
	color: var(--color-heading);
}

.ks-note {
	font-size: 0.82rem;
	color: var(--color-text-muted);
}

.ks-kbd {
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.8rem;
	border: 1px solid var(--color-surface-border);
	border-bottom-width: 2px;
	border-radius: 4px;
	padding: 0 5px;
	background: var(--color-surface);
	color: var(--color-heading);
}
`;

/** Styles every known-site panel starts from: tokens, the shared base, then the small pieces above. */
export const KNOWN_SITE_STYLES = TOKEN_STYLES + AGENTLET_BASE_STYLES + COMMON_STYLES;

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Collapses runs of whitespace (including newlines) to single spaces and trims. */
export function squash(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** Builds a host-page stylesheet once, identified by `id`, and returns a remover. Host pages may run a CSP: the sites supported here allow inline styles (see the docs page). */
export function addPageStyle(id: string, css: string): () => void {
	let style = document.getElementById(id) as HTMLStyleElement | null;
	if (!style) {
		style = document.createElement('style');
		style.id = id;
		style.textContent = css;
		(document.head || document.documentElement).appendChild(style);
	}
	return () => {
		document.getElementById(id)?.remove();
	};
}
