// Playback controller for the animated product scenes (src/components/
// scenes/). Scenes animate purely via CSS; this module only (a) toggles
// play state as scenes enter/leave the viewport, and (b) drives the hero
// carousel and the capability explorer's tabs. No animation logic lives
// here, no library, kept deliberately small.

const prefersReducedMotion =
	typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Force a CSS animation to restart from 0% on its next running frame. */
function restartScene(scene: Element | null): void {
	if (!scene || prefersReducedMotion) return;
	scene.classList.remove('is-playing');
	// Reading offsetWidth forces layout, so the class removal above is
	// flushed before is-playing is re-added and the animation restarts.
	void (scene as HTMLElement).offsetWidth;
	scene.classList.add('is-playing');
}

/** Play scenes while they are on screen, pause (not just hide) offscreen ones. */
function observeScenes(root: ParentNode): void {
	if (prefersReducedMotion) return;
	const scenes = root.querySelectorAll<HTMLElement>('.scene');
	if (!scenes.length) return;
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				entry.target.classList.toggle('is-playing', entry.isIntersecting);
			}
		},
		{ threshold: 0.3 },
	);
	scenes.forEach((scene) => observer.observe(scene));
}

/** Read --scene-duration (set per scene in ms) off an element. */
function sceneDurationMs(scene: Element): number {
	const raw = getComputedStyle(scene).getPropertyValue('--scene-duration').trim();
	const ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
	return Number.isFinite(ms) && ms > 0 ? ms : 7000;
}

/**
 * The hero's autoplaying scene carousel: a row of tabs, one active scene at
 * a time, a progress bar on the active tab, and a play/pause toggle.
 */
class SceneCarousel {
	private slides: HTMLElement[];
	private tabs: HTMLButtonElement[];
	private toggle: HTMLButtonElement | null;
	private index = 0;
	private timer: number | null = null;
	private playing = !prefersReducedMotion;
	private stoppedForGood = false;

	constructor(root: HTMLElement) {
		this.slides = Array.from(root.querySelectorAll<HTMLElement>('[data-slide]'));
		this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		this.toggle = root.querySelector<HTMLButtonElement>('[data-carousel-toggle]');

		this.tabs.forEach((tab, i) => {
			tab.addEventListener('click', () => this.select(i, { userInitiated: true }));
		});
		initRovingTabs(this.tabs, (i) => this.select(i, { userInitiated: true }));

		this.toggle?.addEventListener('click', () => this.toggleAutoplay());
		root.addEventListener('mouseenter', () => this.pauseTimer());
		root.addEventListener('mouseleave', () => this.resumeTimer());
		root.addEventListener('focusin', () => this.pauseTimer());
		root.addEventListener('focusout', () => this.resumeTimer());

		this.select(0, { userInitiated: false, restart: false });
		if (this.playing) this.armTimer();
		this.updateToggleLabel();
	}

	private select(i: number, { userInitiated, restart = true }: { userInitiated: boolean; restart?: boolean }) {
		this.index = i;
		this.slides.forEach((slide, si) => slide.toggleAttribute('hidden', si !== i));
		this.tabs.forEach((tab, ti) => {
			const active = ti === i;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
		});
		const activeSlide = this.slides[i];
		if (restart && activeSlide) restartScene(activeSlide.querySelector('.scene'));
		if (userInitiated) {
			this.stoppedForGood = true;
			this.clearTimer();
			this.setProgress(this.tabs[i], false);
		} else if (this.playing) {
			this.armTimer();
		}
	}

	private armTimer() {
		if (this.stoppedForGood || !this.playing) return;
		this.clearTimer();
		const activeSlide = this.slides[this.index];
		const scene = activeSlide?.querySelector('.scene');
		const duration = scene ? sceneDurationMs(scene) : 7000;
		this.setProgress(this.tabs[this.index], true, duration);
		this.timer = window.setTimeout(() => {
			this.select((this.index + 1) % this.slides.length, { userInitiated: false });
		}, duration);
	}

	private clearTimer() {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		this.tabs.forEach((tab) => this.setProgress(tab, false));
	}

	private pauseTimer() {
		if (!this.playing || this.stoppedForGood) return;
		this.clearTimer();
	}

	private resumeTimer() {
		if (!this.playing || this.stoppedForGood) return;
		this.armTimer();
	}

	private setProgress(tab: HTMLButtonElement | undefined, running: boolean, duration?: number) {
		const bar = tab?.querySelector<HTMLElement>('.hero-progress-fill');
		if (!bar) return;
		bar.style.transitionDuration = running && duration ? `${duration}ms` : '0ms';
		bar.style.transform = running ? 'scaleX(1)' : 'scaleX(0)';
	}

	private toggleAutoplay() {
		this.playing = !this.playing;
		this.stoppedForGood = !this.playing;
		if (this.playing) {
			this.stoppedForGood = false;
			this.armTimer();
		} else {
			this.clearTimer();
		}
		this.updateToggleLabel();
	}

	private updateToggleLabel() {
		if (!this.toggle) return;
		this.toggle.setAttribute('aria-label', this.playing ? 'Pause animation' : 'Play animation');
		this.toggle.classList.toggle('is-paused', !this.playing);
	}
}

/** Roving tabindex + arrow key / Home / End navigation for an ARIA tablist. */
function initRovingTabs(tabs: HTMLButtonElement[], onActivate: (index: number) => void): void {
	tabs.forEach((tab, i) => {
		tab.addEventListener('keydown', (event) => {
			let next = -1;
			if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (i + 1) % tabs.length;
			else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
			else if (event.key === 'Home') next = 0;
			else if (event.key === 'End') next = tabs.length - 1;
			if (next !== -1) {
				event.preventDefault();
				tabs[next]?.focus();
				onActivate(next);
			}
		});
	});
}

/**
 * The capability explorer: an ARIA tabs pattern switching between the 8
 * capability panels, each with its own scene. Only the visible panel's
 * scene should ever be playing.
 */
class CapabilityExplorer {
	private tabs: HTMLButtonElement[];
	private panels: HTMLElement[];

	constructor(root: HTMLElement) {
		root.classList.add('is-enhanced');
		this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
		this.panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'));
		this.tabs.forEach((tab, i) => tab.addEventListener('click', () => this.select(i)));
		initRovingTabs(this.tabs, (i) => this.select(i));
		this.select(0);
	}

	private select(i: number) {
		this.tabs.forEach((tab, ti) => {
			const active = ti === i;
			tab.setAttribute('aria-selected', String(active));
			tab.tabIndex = active ? 0 : -1;
		});
		this.panels.forEach((panel, pi) => {
			const active = pi === i;
			panel.toggleAttribute('hidden', !active);
			if (active) restartScene(panel.querySelector('.scene'));
		});
	}
}

function init(): void {
	observeScenes(document);
	document
		.querySelectorAll<HTMLElement>('[data-scene-carousel]')
		.forEach((el) => new SceneCarousel(el));
	document
		.querySelectorAll<HTMLElement>('[data-capability-explorer]')
		.forEach((el) => new CapabilityExplorer(el));
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
