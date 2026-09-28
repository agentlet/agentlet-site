import type { AuthManagerConfig, AuthResult } from 'agentlet-core';
import { showDemoClosingBubbleOnce } from './shared';

/**
 * Shared helpers behind "Enterprise sign-in (simulated)" (src/agentlets/
 * enterprise-sign-in.ts) and the launcher's lock/unlock UI for entries
 * marked `requiresSignIn` (src/agentlets/manifest.ts, src/agentlets/
 * launcher.ts). Not a manifest entry itself, so it ships no bundle of its
 * own: esbuild bundles it into whichever module imports it, the same way
 * shared.ts is bundled into every agentlet (see manifest.ts's doc comment
 * and scripts/build-cdn.mjs's buildAgentletBundles()).
 *
 * The identity provider this points at is entirely fictitious and hosted on
 * this site (src/pages/try/mock-idp/): no real company, and no network call
 * ever leaves agentlet.io. See /docs/live-demo/ and CLAUDE.md's "No real
 * identity data anywhere" rule.
 *
 * agentlet-core's AuthManager (src/utils/system/AuthManager.ts) only ever
 * keeps `authenticatedUser` in memory: it is cleared the moment the
 * AgentletCore instance is torn down, and never written to storage. Since
 * this site does a full page load on every navigation (a fresh AgentletCore,
 * and so a fresh AuthManager, on every one, see src/scripts/demo-loader.ts),
 * `window.agentlet.auth.getAuthenticatedUser()` is always null immediately
 * after a page load, even for a visitor who signed in one page ago. This
 * module keeps its own copy of the signed-in state in
 * `window.agentlet.storage.session` instead, the same convention
 * docs-companion.ts uses for its reading-progress tracker, which is what
 * actually survives navigation and is what the launcher's lock/unlock UI
 * reads. AuthManager's own `getAuthenticatedUser()`/`logout()` are not used
 * here at all, for that reason: `logout()` in particular only acts (and
 * only shows its confirmation dialog) when its in-memory `authenticatedUser`
 * is set, which is true on the page where the visitor just signed in but
 * false on every page after, so calling it after a navigation would silently
 * no-op instead of clearing the state this demo actually shows.
 */

const MOCK_IDP_PATH = '/try/mock-idp/';
const AUTH_USER_STORAGE_KEY = 'agentlet-demo:enterprise-auth-user';

/**
 * Fired on `window` whenever the persisted sign-in state changes (sign-in
 * success or sign-out), or a sign-in attempt settles without changing it
 * (error or cancel). Listened to by launcher.ts and enterprise-sign-in.ts to
 * re-render: a site-owned convention, the same pattern as shared.ts's
 * SHOW_LAUNCHER_EVENT.
 */
export const AUTH_CHANGED_EVENT = 'agentlet-demo:auth-changed';

export interface DemoAuthUser {
	name: string;
	email: string;
	role: string;
	sub: string;
	/** Raw fake token (base64 JSON), shown in the "Enterprise sign-in" panel. */
	token: string;
	signedInAt: string;
}

function notifyChange(): void {
	window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

/**
 * The signed-in (fake) user, from this session's own storage, or null while
 * signed out. The source of truth for the launcher's lock/unlock UI: see
 * the module doc comment above for why AuthManager's own in-memory state
 * cannot be used for that instead.
 */
export function getDemoAuthUser(): DemoAuthUser | null {
	return window.agentlet?.storage.session.getJSON<DemoAuthUser>(AUTH_USER_STORAGE_KEY, null) ?? null;
}

function persistUser(user: DemoAuthUser): void {
	window.agentlet?.storage.session.setJSON(AUTH_USER_STORAGE_KEY, user);
}

function extractUser(result: AuthResult): DemoAuthUser | null {
	const claims = (result.userInfo ?? null) as Record<string, unknown> | null;
	if (!claims) return null;
	return {
		name: typeof claims.name === 'string' ? claims.name : 'Demo user',
		email: typeof claims.email === 'string' ? claims.email : 'demo@example.com',
		role: typeof claims.role === 'string' ? claims.role : 'IT admin (simulated)',
		sub: typeof claims.sub === 'string' ? claims.sub : 'demo-user',
		token: result.token,
		signedInAt: new Date().toISOString(),
	};
}

/**
 * The first time sign-in succeeds (CLAUDE.md: "the scenario ends with the
 * MessageBubble ... after the first successful sign in"), delayed so it
 * never stacks with the panel's own re-render at the same instant. Calls
 * shared.ts's showDemoClosingBubbleOnce(), which also gates page-audit.ts's
 * own closing bubble: page audit requires signing in first, so without a
 * shared gate a visitor who signs in and then completes an audit in the
 * same session would see two identically worded bubbles stacked at once
 * (review round 1).
 */
function showClosingBubbleOnce(): void {
	window.setTimeout(() => {
		showDemoClosingBubbleOnce();
	}, 2000);
}

/**
 * Points `window.agentlet.authManager` at the fictitious identity provider.
 * Safe to call more than once, including from more than one module's
 * `initModule()` (both launcher.ts and enterprise-sign-in.ts do, since
 * either could be the one that mounts first: a fresh page load restoring a
 * previously active module, see src/scripts/demo-loader.ts, does not
 * necessarily go through the launcher first). `updateConfig()` replaces the
 * whole config object each time, so a repeat call with the same values is a
 * no-op in effect, not a wasted or additive one.
 */
export function configureDemoAuth(): void {
	const authManager = window.agentlet?.authManager;
	if (!authManager) return;

	const config: Partial<AuthManagerConfig> = {
		enabled: true,
		buttonText: 'Sign in with your company account (simulated)',
		loginUrl: `${window.location.origin}${MOCK_IDP_PATH}`,
		popupWidth: 420,
		popupHeight: 560,
		allowedOrigins: [window.location.origin],
		onSuccess: (result) => {
			const user = extractUser(result);
			if (user) {
				persistUser(user);
				showClosingBubbleOnce();
			}
			notifyChange();
		},
		onError: (result) => {
			// Covers the popup-blocked case too: AuthManager's own
			// openAuthPopup() throws "Failed to open authentication popup.
			// Please allow popups for this site." when window.open()
			// returns null, which reaches this callback the same way any
			// other authentication error does.
			window.agentlet?.utils.MessageBubble.error(result.error);
			notifyChange();
		},
		onCancel: () => {
			notifyChange();
		},
	};

	authManager.updateConfig(config);
}

/** Starts the popup sign-in flow. Re-applies the config first (cheap, idempotent) so this works even if something else touched auth config in between. */
export function startSignIn(): void {
	configureDemoAuth();
	void window.agentlet?.auth.startAuthentication();
}

/** Clears this demo's own persisted sign-in state and notifies listeners. Does not call AuthManager's own logout(): see the module doc comment above for why that would not work reliably here. */
export function signOut(): void {
	window.agentlet?.storage.session.remove(AUTH_USER_STORAGE_KEY);
	notifyChange();
}
