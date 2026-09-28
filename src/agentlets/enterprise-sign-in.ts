import { AGENTLET_BASE_STYLES, sourceLinkHtml } from './shared';
import { AUTH_CHANGED_EVENT, configureDemoAuth, getDemoAuthUser, signOut, startSignIn, type DemoAuthUser } from './auth-demo';

/**
 * "Enterprise sign-in (simulated)": explains and drives the same popup
 * sign-in flow the launcher's locked demo cards use (src/agentlets/
 * launcher.ts, src/agentlets/auth-demo.ts), and shows the current auth
 * state plus the fake token's decoded claims. Runs anywhere except /docs/
 * and below, the same pattern as the launcher and page-audit: nothing here
 * depends on page content, so it could run on the docs section too, but
 * matching the other IT-and-security demo keeps the pattern consistent.
 */
const FILE = 'enterprise-sign-in';
const NOT_DOCS_PATTERN = '^(?!.*\\/docs(?:\\/|$)).*$';

const STYLES = `
.auth-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.auth-status {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 14px;
	background: var(--color-surface, #f4f6f8);
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.auth-status p {
	margin: 0;
	font-size: 0.9rem;
}

.auth-claims summary {
	cursor: pointer;
	font-weight: 600;
	color: var(--color-heading, #0f3350);
	font-size: 0.9rem;
}

.auth-claims pre {
	margin: 8px 0 0;
	font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	font-size: 0.78rem;
	white-space: pre-wrap;
	word-break: break-word;
}

.auth-link-button {
	appearance: none;
	background: none;
	border: none;
	padding: 0;
	font: inherit;
	font-size: 0.85rem;
	font-weight: 600;
	color: var(--color-heading, #0f3350);
	text-decoration: underline;
	text-decoration-color: var(--color-accent, #f4a261);
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
	cursor: pointer;
	align-self: flex-start;
}

.auth-status button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}
`;

class EnterpriseSignInModule extends window.agentlet.Module {
	private _container: HTMLElement | null = null;
	private _busy = false;
	private _onAuthChanged: (() => void) | null = null;

	constructor() {
		super({
			name: 'enterprise-sign-in',
			description: 'Simulates a company sign-in through a popup identity provider.',
			patterns: [{ type: 'regex', value: NOT_DOCS_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Enterprise sign-in (simulated)';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);

		// Wired here, not in initModule(): agentlet-core's Module.init() only
		// ever calls initModule() once per instance, but mount()/unmount() run
		// on every activation. A listener added in initModule() would stop
		// firing after this module is ever deactivated and reactivated, since
		// cleanupModule() removed it and initModule() never runs again to add
		// it back (see the same note in launcher.ts's mount()).
		configureDemoAuth();
		this._onAuthChanged = () => {
			this._busy = false;
			this._rerender();
		};
		window.addEventListener(AUTH_CHANGED_EVENT, this._onAuthChanged);
	}

	async unmount(): Promise<void> {
		this._container = null;
		if (this._onAuthChanged) {
			window.removeEventListener(AUTH_CHANGED_EVENT, this._onAuthChanged);
			this._onAuthChanged = null;
		}
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _escape(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	private _render(): string {
		const user = getDemoAuthUser();
		return `
			<div class="agentlet-panel-body">
				<h3>Enterprise sign-in (simulated)</h3>
				<p class="auth-intro">
					Simulates the popup based sign-in a real integration would use, with entirely fictitious
					data. The button below opens a popup pointing at this site's own fictitious identity
					provider. There is no real company behind it and no network call ever leaves agentlet.io.
				</p>
				<p class="auth-intro">
					On success, the popup posts a fake token back to this page with <code>postMessage</code>,
					read by <code>window.agentlet.authManager</code>. This demo then keeps its own copy of the
					signed in state in <code>window.agentlet.storage.session</code>, so it survives moving to
					another page. No backend is involved at any point.
				</p>
				${this._renderStatus(user)}
				${sourceLinkHtml(FILE)}
			</div>
		`;
	}

	private _renderStatus(user: DemoAuthUser | null): string {
		if (!user) {
			return `
				<div class="auth-status" data-auth-status="signed-out">
					<p>Not signed in.</p>
					<button type="button" class="agentlet-try-button" data-action="sign-in" ${this._busy ? 'disabled' : ''}>
						${this._busy ? 'Opening the sign-in popup...' : 'Sign in with your company account (simulated)'}
					</button>
				</div>
			`;
		}

		const claims = { sub: user.sub, name: user.name, email: user.email, role: user.role, demo: true };
		return `
			<div class="auth-status" data-auth-status="signed-in">
				<p>Signed in as <strong>${this._escape(user.name)}</strong> (${this._escape(user.role)}).</p>
				<details class="auth-claims" open>
					<summary>Fake token claims</summary>
					<pre>${this._escape(JSON.stringify(claims, null, 2))}</pre>
				</details>
				<button type="button" class="auth-link-button" data-action="sign-out">Sign out</button>
			</div>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelector('[data-action="sign-in"]')?.addEventListener('click', () => {
			this._busy = true;
			this._rerender();
			startSignIn();
		});
		container.querySelector('[data-action="sign-out"]')?.addEventListener('click', () => {
			signOut();
		});
	}
}

(window as unknown as Record<string, unknown>).EnterpriseSignInModule = EnterpriseSignInModule;
