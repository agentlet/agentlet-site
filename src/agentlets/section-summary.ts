import { AGENTLET_BASE_STYLES, backToLauncherHtml, sourceLinkHtml, wireBackToLauncher } from './shared';

/**
 * "Summarize and share a section": the visitor picks a section of the home
 * page with the core's ElementSelector, the section is captured as an
 * image with ScreenCapture, and a recorded summary for that section is
 * shown next to the image in a fullscreen dialog, labeled "Recorded AI
 * response" like every other demo on this site. No live AI call is made.
 *
 * Home page only: every recorded summary below is written from the home
 * page's own sections (src/components/landing/), so this agentlet only
 * makes sense there. checkPattern() only gates automatic URL-based
 * activation (see agentlet-core's ModuleRegistry.findMatchingModule()), not
 * a manual "Try it" click from the launcher (src/agentlets/launcher.ts),
 * which activates a module directly regardless of its pattern. _render()
 * below defends against that gap the same way expense-receipt.ts does: by
 * checking for a home-page-only landmark and showing a clear message
 * instead of failing silently if it is missing.
 */
const HOME_PAGE_PATTERN = '^https?:\\/\\/[^/]+\\/?(?:[?#].*)?$';
/** Only present on the home page (src/components/landing/TrySandbox.astro); used the same way expense-receipt.ts checks for its own form. */
const HOME_PAGE_MARKER_SELECTOR = '#sandbox';

const FILE = 'section-summary';
const DEMO_SECTION_URL = '/#demo';
const NO_RECORDED_SUMMARY =
	'No recorded summary for this section. This demo only has recorded answers for the main sections of the home page.';

/**
 * ElementSelector is restricted to these landmarks (see the `selector`
 * option passed to `start()` below): agentlet-core's own
 * `findSelectableElement()` walks up from whatever the visitor clicked
 * until it finds an ancestor matching this selector, so the element handed
 * to the callback is already the enclosing `<section>`, `<header>`, or
 * `<footer>`, never some element nested inside one. `closest()` is still
 * called on it in `_handlePick()` below, defensively, so the resolution
 * this comment describes is guaranteed rather than merely assumed.
 */
const LANDMARK_SELECTOR = 'section, header, footer';

interface KnownSection {
	/** Stable id for this section, used for the downloaded image's filename. */
	key: string;
	/** Sentence-case title shown as the fullscreen dialog's title. */
	title: string;
	/** 2-3 sentence recorded summary, written from the section's own copy. */
	summary: string;
	/**
	 * Whether a resolved landmark is this section. Keyed by the section's own
	 * `id` or heading text where one exists (both stable regardless of where
	 * the section sits on the page), falling back to its own CSS class for
	 * the two sections with neither (hero, definition): still an attribute
	 * of the section itself, not a position on the page.
	 */
	matches: (landmark: Element) => boolean;
}

/** First `h1`/`h2`/`h3` inside a landmark, trimmed; every home page section has at most one at its top level. */
function headingTextOf(landmark: Element): string | null {
	const heading = landmark.querySelector('h1, h2, h3');
	const text = heading?.textContent?.trim();
	return text ? text : null;
}

/**
 * One entry per home page section (src/pages/index.astro): hero,
 * definition, demo sandbox, see it in action, deployment modes,
 * capabilities, principles, comparison, get started. Summaries are written
 * from each section's own copy (src/components/landing/), kept factual and
 * short, in the site's own tone (see CLAUDE.md's content style rules).
 */
const KNOWN_SECTIONS: KnownSection[] = [
	{
		key: 'hero',
		title: 'Hero',
		summary:
			'Agentlet augments web apps without touching the backend: a small agent is dropped into any page with a bookmarklet, an extension, or a native integration, adding a side panel with the actions a team needs. The animated story on this section walks through one example, from a form filled by hand to the same form filled by an agentlet. The project is open source, under the MIT license.',
		matches: (landmark) => landmark.classList.contains('hero'),
	},
	{
		key: 'definition',
		title: 'Definition',
		summary:
			'Defines the word "agentlet": a lightweight, embeddable software agent injected into an existing application, typically via a browser bookmarklet or extension. It adds autonomous or semi-autonomous capabilities such as automation, AI, analytics, or UX augmentation, without requiring any backend change.',
		matches: (landmark) => landmark.classList.contains('definition-section'),
	},
	{
		key: 'sandbox',
		title: 'Demo sandbox',
		summary:
			'A working sandbox: a fictitious receipt and a small expense report form, both usable by hand with no agentlet at all. Opening the live demo and picking "Receipt to expense report" here shows an agentlet reading the receipt and filling the form for review, without ever submitting it.',
		matches: (landmark) => landmark.id === 'sandbox',
	},
	{
		key: 'demo',
		title: 'See it in action',
		summary:
			'Shows the same business application before and after being augmented with an agentlet: manual, field by field entry on one side, and the same task automated through an agentlet side panel on the other.',
		matches: (landmark) => landmark.id === 'demo',
	},
	{
		key: 'deployment-modes',
		title: 'Three ways to deploy',
		summary:
			'Describes the three ways to deploy an agentlet, all offering the same core capabilities: a bookmarklet needing no installation, an installable browser extension with access to more browser APIs and persistent state, and a native integration where the host application loads the same code directly.',
		matches: (landmark) => headingTextOf(landmark) === 'Three ways to deploy',
	},
	{
		key: 'capabilities',
		title: 'What it brings to your application',
		summary:
			'Lists what agentlet-core brings to a host application: form filling, table export to Excel, screenshots, AI on text, images and PDF, dialogs and notifications, optional authentication, shadow DOM isolation, and a mount API for framework UIs. Each capability links to the real public API call behind it.',
		matches: (landmark) => headingTextOf(landmark) === 'What it brings to your application',
	},
	{
		key: 'principles',
		title: 'Guiding principles',
		summary:
			"States agentlet's guiding principles: target specific needs instead of generic, global changes; respect the host application's styles; offer opt-in features through a side panel; assist without overriding, so forms are filled but never auto-submitted; and stay lightweight by relying on the host's own backend APIs.",
		matches: (landmark) => headingTextOf(landmark) === 'Guiding principles',
	},
	{
		key: 'comparison',
		title: 'Compared to robots',
		summary:
			"Compares agentlets to RPA-style robots across installation, autonomy, security scope, robustness, and reach. Agentlets are lighter to install and narrower in scope, but, unlike a robot, they depend on the user's active tab and enhance rather than replace the user's own interaction.",
		matches: (landmark) => headingTextOf(landmark) === 'Compared to robots',
	},
	{
		key: 'get-started',
		title: 'Get started',
		summary: 'The call to action to start building: install the agentlet-core package with npm, then follow the getting started guide to build a first agentlet.',
		matches: (landmark) => headingTextOf(landmark) === 'Get started',
	},
];

function findKnownSection(landmark: Element): KnownSection | null {
	return KNOWN_SECTIONS.find((section) => section.matches(landmark)) ?? null;
}

/** Sentence-case fallback title for a resolved landmark with no recorded summary (header, footer). */
function fallbackTitle(landmark: Element): string {
	const tag = landmark.tagName.toLowerCase();
	return tag.charAt(0).toUpperCase() + tag.slice(1);
}

interface PickedSection {
	title: string;
	summary: string;
	hasSummary: boolean;
	dataUrl: string;
	canvas: HTMLCanvasElement;
}

const STYLES = `
.section-summary-intro {
	color: var(--color-text-muted, #5b6b78);
	font-size: 0.9rem;
}

.section-summary-last {
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 10px;
	padding: 12px;
	background: var(--color-surface, #f4f6f8);
	font-size: 0.85rem;
	color: var(--color-text, #3d4f5e);
}

.section-summary-last strong {
	color: var(--color-heading, #0f3350);
}

.section-summary-error {
	border: 1px solid #c0392b;
	background: rgba(192, 57, 43, 0.08);
	color: #c0392b;
	border-radius: 8px;
	padding: 10px 12px;
	font-size: 0.85rem;
}

.section-summary-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.section-summary-report {
	display: flex;
	flex-direction: column;
	gap: 16px;
	font-family: 'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

.section-summary-thumb {
	display: block;
	max-width: 100%;
	border: 1px solid var(--color-surface-border, #d9e0e6);
	border-radius: 8px;
}

.section-summary-recorded-label {
	display: inline-block;
	font-family: 'IBM Plex Mono', ui-monospace, monospace;
	font-size: 0.7rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
	padding: 2px 8px;
	border-radius: 999px;
	background: var(--color-badge-bg, #fde8d7);
	color: var(--color-badge-text, #7a3a10);
	margin-bottom: 8px;
}

.section-summary-text {
	margin: 0;
	font-size: 0.95rem;
	line-height: 1.5;
	color: var(--color-text, #3d4f5e);
}

.section-summary-dialog-actions {
	display: flex;
	align-items: center;
	gap: 12px;
	flex-wrap: wrap;
}

.section-summary-dialog-actions button {
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

.section-summary-dialog-actions button:hover {
	background: var(--color-primary-bg-hover, #1b4a70);
}
`;

/**
 * Workaround for a real agentlet-core limitation (reported below, not fixed
 * here: this agentlet may not edit the site's shared scene components).
 *
 * Some home page decorations (src/components/scenes/HeroStoryScene.astro's
 * `.story-features` overlay, inside the hero section, and
 * DialogScene.astro's `.scene-dialog-overlay`, inside one of the
 * capabilities tabs) set `background: color-mix(in srgb, var(--color-bg)
 * X%, transparent)`. Chromium resolves that at computed-style time to a
 * `color(srgb r g b / a)` value (CSS Color 4's `color()` function, not
 * `color-mix()` itself, which no longer appears once resolved). The
 * html2canvas build vendored inside agentlet-core.min.js (agentlet-core
 * 2.1.0, see ScreenCapture.ensureHTML2Canvas()) does not parse `color()`
 * and throws `Attempting to parse an unsupported color function "color"`
 * while reading that single element's style, which aborts the *entire*
 * capture, not just that decoration, so `ScreenCapture.captureElement()`
 * fails outright for the hero section (and would for that capabilities tab
 * too, once visible).
 *
 * Passed as this capture's `onclone` (an `Html2CanvasOptions` field
 * forwarded to html2canvas, see the public API types): runs against the
 * offscreen clone html2canvas is about to read, after that clone's own
 * stylesheets are attached (agentlet-core copies them over before calling
 * this hook), so its own `getComputedStyle()` already reflects the same
 * resolved `color(...)` values the live page would. Overriding a style here
 * only ever touches that throwaway clone, never the live page. Walks every
 * element, and wherever its resolved background contains a `color(` value
 * html2canvas cannot parse, sets a plain, parseable one instead
 * (`transparent`, losing only that decorative tint in the captured image,
 * nothing else).
 */
function neutralizeUnsupportedColorFunctions(clonedDocument: Document): void {
	const root = clonedDocument.body;
	const view = clonedDocument.defaultView;
	if (!root || !view) return;

	const elements: Element[] = [root, ...Array.from(root.querySelectorAll('*'))];
	for (const element of elements) {
		const style = view.getComputedStyle(element);
		if (style.backgroundImage.includes('color(') || style.backgroundColor.includes('color(')) {
			(element as HTMLElement).style.setProperty('background', 'transparent', 'important');
		}
	}
}

class SectionSummaryModule extends window.agentlet.Module {
	private _busy = false;
	private _error: string | null = null;
	private _lastPicked: { title: string; hasSummary: boolean } | null = null;
	private _container: HTMLElement | null = null;

	constructor() {
		super({
			name: 'section-summary',
			description: 'Picks a section of the home page and shows a recorded summary you can copy or share as an image.',
			patterns: [{ type: 'regex', value: HOME_PAGE_PATTERN }],
		});
	}

	getPanelTitle(): string {
		return 'Summarize and share a section';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.injectStyles(AGENTLET_BASE_STYLES + STYLES);
		this._container = container;
		this._renderInto(container);
	}

	async unmount(): Promise<void> {
		this._container = null;
	}

	private _homePageMarker(): Element | null {
		return document.querySelector(HOME_PAGE_MARKER_SELECTOR);
	}

	private _renderInto(container: HTMLElement): void {
		container.innerHTML = this._render();
		this._wireActions(container);
	}

	private _rerender(): void {
		if (this._container) this._renderInto(this._container);
	}

	private _escape(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	private _render(): string {
		if (!this._homePageMarker()) {
			return `
				<div class="agentlet-panel-body">
					<h3>Summarize and share a section</h3>
					<p class="section-summary-intro">
						This demo works on agentlet.io's home page, where the sections it summarizes live. Go to
						the home page and open this demo again from there.
					</p>
					${sourceLinkHtml(FILE)}
					${backToLauncherHtml()}
				</div>
			`;
		}

		return `
			<div class="agentlet-panel-body">
				<h3>Summarize and share a section</h3>
				<p class="section-summary-intro">
					Point at a section of this page. It is captured as an image and shown next to a recorded
					summary you can copy or download.
				</p>
				${this._error ? `<p class="section-summary-error">${this._escape(this._error)}</p>` : ''}
				${this._renderLast()}
				<div class="section-summary-actions">
					<button type="button" class="agentlet-try-button" data-action="pick" ${this._busy ? 'disabled' : ''}>
						${this._busy ? 'Working...' : 'Pick a section'}
					</button>
				</div>
				${sourceLinkHtml(FILE)}
				${backToLauncherHtml()}
			</div>
		`;
	}

	private _renderLast(): string {
		if (!this._lastPicked) return '';
		const { title, hasSummary } = this._lastPicked;
		const note = hasSummary ? 'a recorded summary was shown for it' : 'this section has no recorded summary';
		return `
			<p class="section-summary-last">
				Last picked: <strong>${this._escape(title)}</strong>, ${note}.
			</p>
		`;
	}

	private _wireActions(container: HTMLElement): void {
		container.querySelector('[data-action="pick"]')?.addEventListener('click', () => {
			this._startPick();
		});
		wireBackToLauncher(container);
	}

	private _startPick(): void {
		const selector = window.agentlet?.utils.ElementSelector;
		if (!selector) {
			this._error = 'The element selector is not available in this browser.';
			this._rerender();
			return;
		}
		if (selector.isActive) return;

		this._error = null;
		this._busy = true;
		this._rerender();

		selector.start(
			(element) => {
				this._busy = false;
				void this._handlePick(element);
			},
			{
				selector: LANDMARK_SELECTOR,
				message: 'Click a section of the page to summarize it, or press Escape to cancel.',
			},
		);
	}

	/**
	 * ElementSelector's own `findSelectableElement()` already walked up to a
	 * `section`/`header`/`footer` ancestor before calling back (see
	 * LANDMARK_SELECTOR above), so `element` normally already is that
	 * landmark. `closest()` is still applied, inclusive of `element` itself,
	 * so the resolution described in that comment holds even if it is ever
	 * called with something else (e.g. a future direct API use).
	 */
	private async _handlePick(element: Element): Promise<void> {
		const landmark = element.closest(LANDMARK_SELECTOR);
		if (!landmark) {
			this._error = 'Could not resolve the pick to a section of the page.';
			this._rerender();
			return;
		}

		const capture = window.agentlet?.utils.ScreenCapture;
		if (!capture) {
			this._error = 'The screen capture tool is not available in this browser.';
			this._rerender();
			return;
		}

		this._busy = true;
		this._error = null;
		this._rerender();

		try {
			const available = await capture.ensureHTML2Canvas();
			if (!available) throw new Error('The screenshot library could not be loaded in this browser.');

			const canvas = await capture.captureElement(landmark as HTMLElement, { onclone: neutralizeUnsupportedColorFunctions });
			const dataUrl = capture.canvasToDataURL(canvas);

			const known = findKnownSection(landmark);
			const picked: PickedSection = known
				? { title: known.title, summary: known.summary, hasSummary: true, dataUrl, canvas }
				: { title: fallbackTitle(landmark), summary: NO_RECORDED_SUMMARY, hasSummary: false, dataUrl, canvas };

			this._lastPicked = { title: picked.title, hasSummary: picked.hasSummary };
			this._showResult(picked, known?.key ?? null);
		} catch (error) {
			this._error = error instanceof Error ? error.message : String(error);
			window.agentlet?.utils.MessageBubble.error(this._error);
		} finally {
			this._busy = false;
			this._rerender();
		}
	}

	private _showResult(picked: PickedSection, key: string | null): void {
		const dialog = window.agentlet?.utils.Dialog;
		if (!dialog) {
			window.agentlet?.utils.MessageBubble.error('The dialog system is not available in this browser.');
			return;
		}

		dialog.show(
			'fullscreen',
			{
				title: picked.title,
				icon: '',
				customContent: this._buildReportContent(picked, key),
				buttons: [{ text: 'Close', value: 'close', primary: true }],
				scrollable: true,
			},
			() => {
				window.agentlet?.utils.MessageBubble.show({
					type: 'info',
					message: `This ran on agentlet.io. <a href="${DEMO_SECTION_URL}" style="color: inherit;">See it on a real business app</a>.`,
					allowHtml: true,
					duration: 0,
					closable: true,
				});
			},
		);
	}

	private _buildReportContent(picked: PickedSection, key: string | null): HTMLElement {
		const container = document.createElement('div');
		container.className = 'section-summary-report';

		const image = document.createElement('img');
		image.className = 'section-summary-thumb';
		image.src = picked.dataUrl;
		image.alt = `Screenshot of the "${picked.title}" section of the home page`;
		container.appendChild(image);

		const label = document.createElement('span');
		label.className = 'section-summary-recorded-label';
		label.textContent = 'Recorded AI response';
		container.appendChild(label);

		const summary = document.createElement('p');
		summary.className = 'section-summary-text';
		summary.textContent = picked.summary;
		container.appendChild(summary);

		const actions = document.createElement('div');
		actions.className = 'section-summary-dialog-actions';

		const copyButton = document.createElement('button');
		copyButton.type = 'button';
		copyButton.textContent = 'Copy the summary';
		copyButton.addEventListener('click', () => {
			void this._copySummary(picked.summary);
		});
		actions.appendChild(copyButton);

		const downloadButton = document.createElement('button');
		downloadButton.type = 'button';
		downloadButton.textContent = 'Download the image';
		downloadButton.addEventListener('click', () => {
			void this._downloadImage(picked.canvas, key);
		});
		actions.appendChild(downloadButton);

		container.appendChild(actions);

		return container;
	}

	private async _copySummary(summary: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(summary);
			window.agentlet?.utils.MessageBubble.success('Summary copied to the clipboard.');
		} catch {
			window.agentlet?.utils.MessageBubble.error('Could not copy the summary to the clipboard.');
		}
	}

	/**
	 * Builds the PNG from the same canvas already captured for the dialog's
	 * image (no second capture), then downloads it through a same-origin
	 * blob link: `URL.createObjectURL()` on a blob this code creates itself,
	 * clicked once and revoked right after. No core "download" API covers a
	 * plain image blob (ScreenCapture.downloadCapture() would re-capture the
	 * target instead of reusing this one), so this is the "or a same-origin
	 * blob link" alternative the brief calls for.
	 */
	private async _downloadImage(canvas: HTMLCanvasElement, key: string | null): Promise<void> {
		const capture = window.agentlet?.utils.ScreenCapture;
		if (!capture) {
			window.agentlet?.utils.MessageBubble.error('The screen capture tool is not available in this browser.');
			return;
		}

		try {
			const blob = await capture.canvasToBlob(canvas);
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `agentlet-${key ?? 'section'}-summary.png`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
		} catch {
			window.agentlet?.utils.MessageBubble.error('Could not download the image.');
		}
	}
}

(window as unknown as Record<string, unknown>).SectionSummaryModule = SectionSummaryModule;
