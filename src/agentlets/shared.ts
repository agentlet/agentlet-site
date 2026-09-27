/**
 * Small helpers shared by every agentlet module built from src/agentlets/.
 * Kept deliberately tiny: each module bundles this file itself (esbuild
 * bundles per entry point, see scripts/build-cdn.mjs), so it must not pull
 * in anything heavy.
 */

/**
 * The site repository. Private today; the coordinator handles telling
 * visitors that until it is public. The link is still correct and will
 * start working the day the repository opens up.
 */
export const SITE_REPO_URL = 'https://github.com/agentlet/agentlet-site';

/** Href for the "View the source of this agentlet" link, for a given src/agentlets/<file>.ts. */
export function sourceUrl(file: string): string {
	return `${SITE_REPO_URL}/blob/main/src/agentlets/${file}.ts`;
}

/** Markup for the "View the source of this agentlet" link, consistent across every agentlet's panel. */
export function sourceLinkHtml(file: string): string {
	return `<a class="agentlet-source-link" href="${sourceUrl(file)}" target="_blank" rel="noopener noreferrer">View the source of this agentlet</a>`;
}

/**
 * Base panel styles shared by every agentlet built here: brand accent, no
 * gradient, readable in both site themes. Custom properties defined on
 * :root in src/styles/landing.css (and mirrored by Starlight's own theme
 * tokens) inherit into the panel's shadow root, since shadow DOM only
 * encapsulates style rules, not custom-property inheritance, so `var(...)`
 * below tracks the visitor's current theme live. Fallback values match
 * landing.css's light theme, for the rare case a module mounts outside the
 * site (patterns matching a foreign host) where those properties are not
 * defined.
 */
export const AGENTLET_BASE_STYLES = `
.agentlet-panel-body {
	font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	color: var(--color-text, #3d4f5e);
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.agentlet-panel-body h3 {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.agentlet-panel-body p {
	margin: 0;
	line-height: 1.5;
}

.agentlet-empty-state {
	border: 1px dashed var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 20px;
	color: var(--color-text-muted, #5b6b78);
	text-align: center;
}

.agentlet-demo-list {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.agentlet-demo-card {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 14px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.agentlet-demo-card-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.agentlet-demo-title {
	font-weight: 600;
	color: var(--color-heading, #0f3350);
}

.agentlet-audience-pill {
	font-size: 0.72rem;
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--color-badge-bg, #fde8d7);
	color: var(--color-badge-text, #7a3a10);
	white-space: nowrap;
}

.agentlet-demo-description {
	margin: 0;
	color: var(--color-text, #3d4f5e);
	font-size: 0.9rem;
}

.agentlet-demo-actions {
	display: flex;
	align-items: center;
	gap: 12px;
}

.agentlet-try-button {
	appearance: none;
	border: 1.5px solid transparent;
	border-radius: 8px;
	background: var(--color-primary-bg, #0f3350);
	color: var(--color-primary-text, #ffffff);
	font: inherit;
	font-weight: 600;
	font-size: 0.85rem;
	padding: 6px 14px;
	cursor: pointer;
}

.agentlet-try-button:hover {
	background: var(--color-primary-bg-hover, #1b4a70);
}

.agentlet-try-button:disabled {
	cursor: not-allowed;
	opacity: 0.6;
}

.agentlet-source-link,
.agentlet-demo-source-link {
	font-size: 0.82rem;
	color: var(--color-heading, #0f3350);
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
}
`;

/**
 * Site-owned convention (there is no core API for it): any mounted module
 * can call this to ask the launcher to become the active module again,
 * without needing a reference to the launcher's own instance. The launcher
 * listens for it once, in its initModule(). See launcher.ts for why this
 * exists: window.agentlet.moduleRegistry.activateModule() is public and
 * real, but a module has no public way to look up "the launcher" by
 * convention other than window.agentlet.modules.get('launcher').
 */
export const SHOW_LAUNCHER_EVENT = 'agentlet:show-launcher';

export function requestShowLauncher(): void {
	window.dispatchEvent(new CustomEvent(SHOW_LAUNCHER_EVENT));
}
