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

/**
 * Href for the "View the source of this agentlet" link, for a given
 * src/agentlets/<file>.<ext>. `ext` defaults to `ts`, the extension every
 * demo but one (white-label.tsx) uses; pass a manifest entry's own
 * `fileExt` for the rest, so a `.tsx` module still links to the file that
 * actually exists.
 */
export function sourceUrl(file: string, ext: 'ts' | 'tsx' = 'ts'): string {
	return `${SITE_REPO_URL}/blob/main/src/agentlets/${file}.${ext}`;
}

/** Markup for the "View the source of this agentlet" link, consistent across every agentlet's panel. */
export function sourceLinkHtml(file: string, ext: 'ts' | 'tsx' = 'ts'): string {
	return `<a class="agentlet-source-link" href="${sourceUrl(file, ext)}" target="_blank" rel="noopener noreferrer">View the source of this agentlet</a>`;
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
 *
 * That fallback used to be a single literal hex value, which broke on
 * Starlight pages (/docs/ and below): src/styles/landing.css defines
 * --color-*, but Starlight pages only ever define Starlight's own
 * --sl-color-* set (see src/styles/starlight-theme.css), never --color-*.
 * A docs page therefore always fell through straight to the literal,
 * light-mode hex below, regardless of the site's actual dark or light
 * theme, so the panel's text and surfaces stayed light even against a
 * dark docs page. Each of the text/surface/border tokens below now falls
 * back to the closest Starlight token first (also inherited into the
 * shadow root the same way), and only then to the literal hex, so the
 * panel follows whichever theme system the current page actually
 * defines. The accent and primary-button tokens are left as plain
 * literal fallbacks: they already read as the same brand orange or navy
 * in both of this site's own themes (see landing.css), so there is
 * nothing for them to track.
 */
export const AGENTLET_BASE_STYLES = `
.agentlet-panel-body {
	font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
	color: var(--color-text, var(--sl-color-gray-1, #3d4f5e));
	padding: 16px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.agentlet-panel-body h3 {
	margin: 0;
	font-size: 1.05rem;
	font-weight: 600;
	color: var(--color-heading, var(--sl-color-white, #0f3350));
}

.agentlet-panel-body p {
	margin: 0;
	line-height: 1.5;
}

.agentlet-empty-state {
	border: 1px dashed var(--color-surface-border, var(--sl-color-gray-5, #d9e0e6));
	border-radius: 10px;
	padding: 20px;
	color: var(--color-text-muted, var(--sl-color-gray-3, #5b6b78));
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
	border: 1px solid var(--color-surface-border, var(--sl-color-gray-5, #d9e0e6));
	border-radius: 10px;
	padding: 14px;
	background: var(--color-surface, var(--sl-color-gray-6, #f4f6f8));
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
	color: var(--color-heading, var(--sl-color-white, #0f3350));
}

.agentlet-audience-pill {
	font-size: 0.72rem;
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--color-badge-bg, var(--sl-color-orange-low, #fde8d7));
	color: var(--color-badge-text, var(--sl-color-orange-high, #7a3a10));
	white-space: nowrap;
}

.agentlet-demo-description {
	margin: 0;
	color: var(--color-text, var(--sl-color-gray-1, #3d4f5e));
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
	color: var(--color-heading, var(--sl-color-white, #0f3350));
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
}

.agentlet-back-to-demos {
	appearance: none;
	border: none;
	background: none;
	padding: 0;
	margin: 0;
	font: inherit;
	font-size: 0.82rem;
	font-weight: 600;
	color: var(--color-heading, var(--sl-color-white, #0f3350));
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
	cursor: pointer;
	align-self: flex-start;
}

.agentlet-back-to-demos-note {
	margin: 0;
	font-size: 0.82rem;
	color: var(--color-text-muted, var(--sl-color-gray-3, #5b6b78));
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

/**
 * True on `/docs/` and below, the one place the launcher itself never runs
 * (its own pattern excludes it, see launcher.ts's NOT_DOCS_PATTERN, so it
 * cannot be reached with requestShowLauncher() there either).
 */
export function isDocsPage(): boolean {
	return /\/docs(\/|$)/.test(window.location.pathname);
}

const BACK_TO_LAUNCHER_ACTION = 'show-launcher';

/**
 * Markup for the "Back to all demos" action shown at the end of every demo
 * panel except the launcher itself: a small button that calls
 * requestShowLauncher() (see wireBackToLauncher()) to bring the launcher's
 * list back. On a docs page the launcher never runs (isDocsPage() above),
 * so a button here would go nowhere; this renders an explanatory note
 * instead, pointing back at the rest of the site.
 */
export function backToLauncherHtml(): string {
	if (isDocsPage()) {
		return '<p class="agentlet-back-to-demos-note">The full list of demos is on the rest of the site, not the docs.</p>';
	}
	return `<button type="button" class="agentlet-back-to-demos" data-action="${BACK_TO_LAUNCHER_ACTION}">Back to all demos</button>`;
}

/**
 * Wires the click handler for backToLauncherHtml()'s button. A no-op on a
 * docs page (and anywhere else the button was not rendered), where
 * backToLauncherHtml() returned the plain note instead.
 */
export function wireBackToLauncher(container: ParentNode): void {
	container.querySelector(`[data-action="${BACK_TO_LAUNCHER_ACTION}"]`)?.addEventListener('click', () => {
		requestShowLauncher();
	});
}

const CLOSING_BUBBLE_ONCE_KEY = 'agentlet-demo:closing-bubble-shown';
const DEMO_SECTION_URL = '/#demo';

/**
 * Shows the "This ran on agentlet.io..." closing nudge, but only once across
 * the whole demo session, no matter which demo triggers it first. Page audit
 * requires signing in first (manifest.ts's `requiresSignIn`), so its own
 * closing bubble and "Enterprise sign-in (simulated)"'s are the two most
 * likely to fire in the same session; both call this shared helper instead
 * of building their own persistent (`duration: 0`) MessageBubble, so a
 * visitor who does both in one visit sees the nudge once, not two
 * identically worded bubbles stacked on top of each other.
 */
export function showDemoClosingBubbleOnce(): void {
	const alreadyShown = window.agentlet?.storage.session.get(CLOSING_BUBBLE_ONCE_KEY);
	if (alreadyShown) return;
	window.agentlet?.storage.session.set(CLOSING_BUBBLE_ONCE_KEY, '1');
	window.agentlet?.utils.MessageBubble.show({
		type: 'info',
		message: `This ran on agentlet.io. <a href="${DEMO_SECTION_URL}" style="color: inherit;">See it on a real business app</a>.`,
		allowHtml: true,
		duration: 0,
		closable: true,
	});
}

/**
 * The home page's demo sandbox (src/components/landing/TrySandbox.astro) is
 * a native `<details id="sandbox">`, collapsed by default and styled as its
 * own visually separate zone, kept out of the way until a visitor actually
 * wants it. Both the expense-receipt and page-audit demos operate on it, so
 * this one helper opens it and scrolls it into view for either, rather than
 * each module re-implementing the same two DOM calls.
 *
 * The page audit in particular depends on this: a closed `<details>` hides
 * its non-summary content the same way `display: none` would (still in the
 * DOM, but not visible, not part of the accessibility tree), so its three
 * deliberate defects would otherwise never be found or reported, even
 * though `document.querySelectorAll()` can still see the elements.
 *
 * A no-op returning false on any page without a sandbox (every page except
 * the home page), so callers can call it unconditionally.
 */
const SANDBOX_ID = 'sandbox';

export function openSandbox(): boolean {
	const details = document.getElementById(SANDBOX_ID);
	if (!(details instanceof HTMLDetailsElement)) return false;
	details.open = true;
	details.scrollIntoView({ behavior: 'smooth', block: 'start' });
	return true;
}
