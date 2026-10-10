// The hero's audience tabs (src/components/landing/Hero.astro): an ARIA
// tabs pattern with one tabpanel holding one message per audience. All
// messages are in the server HTML, stacked in one grid cell so the block
// keeps the height of the tallest one; this script only marks one of them
// active and cross-fades between them (see .hero-audience-* in
// src/styles/landing.css).
//
// Rotation: with JavaScript, the next tab is selected every ROTATE_MS.
// It stops for good once the visitor interacts with the tabs (click,
// keyboard focus inside the tablist, arrow keys). While it has not
// stopped for good, it also holds still (and resumes with the time it had
// left) while the pointer is over the hero copy, while the page is hidden,
// and while the site-wide "Pause animations" toggle is pressed (see
// src/components/landing/AnimationsToggle.astro). The rotating text has
// no aria-live on purpose: screen readers get the tabs, not an
// announcement every few seconds. Like the scenes, nothing here reads
// prefers-reduced-motion, by product decision; the toggle is the way to
// stop the motion.

import { initRovingTabs, isAnimationsPaused } from './scenes.ts';

const ROTATE_MS = 8000;

class HeroAudience {
	private tabs: HTMLButtonElement[];
	private messages: HTMLElement[];
	private panel: HTMLElement | null;
	private tablist: HTMLElement | null;
	private copy: HTMLElement | null;
	private index = 0;
	private timer: number | null = null;
	private root: HTMLElement;
	/** Time left before the next rotation; the full interval after a tab change. */
	private remainingMs = ROTATE_MS;
	private runningSince = 0;
	private interacted = false;
	private hovering = false;
	private globalPaused = isAnimationsPaused();

	constructor(root: HTMLElement) {
		this.tablist = root.querySelector<HTMLElement>('[role="tablist"]');
		this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		this.messages = Array.from(root.querySelectorAll<HTMLElement>('.hero-audience-message'));
		this.panel = root.querySelector<HTMLElement>('[role="tabpanel"]');
		this.copy = root.closest<HTMLElement>('.hero-copy');
		this.root = root;
		if (!this.tabs.length || this.tabs.length !== this.messages.length) return;

		root.classList.add('is-enhanced');
		root.dataset.rotating = 'true';
		const initial = this.tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true');
		this.index = Math.max(0, initial);

		this.tabs.forEach((tab, i) => tab.addEventListener('click', () => this.userSelect(i)));
		initRovingTabs(this.tabs, (i) => this.userSelect(i));
		// Keyboard focus anywhere in the tablist (Tab key, arrow keys) counts
		// as interaction, even before a selection changes.
		this.tablist?.addEventListener('focusin', () => this.stopForGood());

		const target = this.copy ?? root;
		target.addEventListener('pointerenter', (event) => {
			if (event.pointerType === 'touch') return;
			this.hovering = true;
			this.applyRunState();
		});
		target.addEventListener('pointerleave', (event) => {
			if (event.pointerType === 'touch') return;
			this.hovering = false;
			this.applyRunState();
		});
		document.addEventListener('visibilitychange', () => this.applyRunState());
		document.addEventListener('agentlet:animations-change', (event) => {
			this.globalPaused = (event as CustomEvent<{ paused: boolean }>).detail.paused;
			this.applyRunState();
		});

		this.show(this.index);
		this.applyRunState();
	}

	private get shouldRun(): boolean {
		return !this.interacted && !this.hovering && !this.globalPaused && document.visibilityState === 'visible';
	}

	/** Mark tab and message i active; does not touch the timer. */
	private show(i: number): void {
		this.index = i;
		this.tabs.forEach((tab, ti) => {
			const active = ti === i;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
			const fill = tab.querySelector<HTMLElement>('.hero-audience-progress');
			if (fill) {
				fill.style.transitionDuration = '0ms';
				fill.style.transform = 'scaleX(0)';
			}
		});
		this.messages.forEach((message, mi) => message.classList.toggle('is-active', mi === i));
		const activeTab = this.tabs[i];
		if (this.panel && activeTab) this.panel.setAttribute('aria-labelledby', activeTab.id);
		this.remainingMs = ROTATE_MS;
	}

	private userSelect(i: number): void {
		this.stopForGood();
		if (i !== this.index) this.show(i);
	}

	/** The visitor took over: no more automatic rotation on this page view. */
	private stopForGood(): void {
		if (this.interacted) return;
		this.interacted = true;
		this.root.dataset.rotating = 'false';
		this.applyRunState();
	}

	private clearTimer(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** Start, hold or stop the rotation timer after any state change,
	 * keeping the time left within the current tab. */
	private applyRunState(): void {
		const wasRunning = this.timer !== null;
		this.clearTimer();
		const fill = this.tabs[this.index]?.querySelector<HTMLElement>('.hero-audience-progress') ?? null;
		if (this.shouldRun) {
			this.runningSince = Date.now();
			if (fill) {
				// Flush the reset in show() (or the freeze below) before
				// animating, so the transition is not collapsed.
				void fill.offsetWidth;
				fill.style.transitionDuration = `${this.remainingMs}ms`;
				fill.style.transform = 'scaleX(1)';
			}
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.show((this.index + 1) % this.tabs.length);
				this.applyRunState();
			}, this.remainingMs);
		} else if (wasRunning) {
			const elapsed = Date.now() - this.runningSince;
			this.remainingMs = Math.max(50, this.remainingMs - elapsed);
			if (fill) {
				const current = getComputedStyle(fill).transform;
				fill.style.transitionDuration = '0ms';
				fill.style.transform = current;
			}
		}
	}
}

function init(): void {
	document.querySelectorAll<HTMLElement>('[data-hero-audience]').forEach((el) => new HeroAudience(el));
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
