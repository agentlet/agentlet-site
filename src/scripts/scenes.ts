// Playback controller for the animated product scenes (src/components/
// scenes/). Scenes animate purely via CSS; this module only (a) toggles
// play state as scenes enter/leave the viewport, (b) drives the hero
// story's step timer, and (c) drives the capability explorer's tabs. No
// animation logic lives here, no library, kept deliberately small.

/** Force a CSS animation to restart from 0% on its next running frame. */
function restartScene(scene: Element | null): void {
	if (!scene) return;
	scene.classList.remove('is-playing');
	// Reading offsetWidth forces layout, so the class removal above is
	// flushed before is-playing is re-added and the animation restarts.
	void (scene as HTMLElement).offsetWidth;
	scene.classList.add('is-playing');
}

/** Play scenes while they are on screen, pause (not just hide) offscreen ones. */
function observeScenes(root: ParentNode): void {
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

/**
 * The hero's single story animation (see HeroStoryScene.astro): a step
 * timer sets data-step="1".."N" on the scene root, updates the (aria
 * hidden) subtitle text from the accessible step list, and fills a
 * segmented progress bar, one segment per step (each a button that
 * jumps to its step). Autoplay pauses while
 * the hero is offscreen or the tab is hidden and resumes when back,
 * unless the user paused; it does not pause on hover. Plays the same
 * way regardless of prefers-reduced-motion, by product decision: Pause
 * and Replay (always visible) are the user's way to stop it.
 */
class StoryController {
	private scene: HTMLElement | null;
	private subtitle: HTMLElement | null;
	private stepTexts: string[];
	private segments: HTMLElement[];
	private durations: number[];
	private toggle: HTMLButtonElement | null;
	private replay: HTMLButtonElement | null;
	private index = 0;
	private timer: number | null = null;
	private userPaused = false;
	private offscreen = true;
	/** Time left in the current step; the full duration on a fresh step,
	 * reduced by however long it already ran each time it is paused. */
	private remainingMs = 0;
	/** When the current run of the timer started, for computing the above. */
	private runningSince = 0;

	constructor(root: HTMLElement) {
		this.scene = root.querySelector<HTMLElement>('.scene');
		this.subtitle = root.querySelector<HTMLElement>('[data-story-subtitle]');
		this.stepTexts = Array.from(root.querySelectorAll('.story-steps li')).map((li) => li.textContent ?? '');
		this.segments = Array.from(root.querySelectorAll<HTMLElement>('[data-story-segment]'));
		this.durations = this.segments.map((segment) => Number(segment.dataset.duration) || 3000);
		this.toggle = root.querySelector<HTMLButtonElement>('[data-story-toggle]');
		this.replay = root.querySelector<HTMLButtonElement>('[data-story-replay]');

		this.toggle?.addEventListener('click', () => this.toggleUserPause());
		this.replay?.addEventListener('click', () => this.restart());
		this.segments.forEach((segment, i) => segment.addEventListener('click', () => this.jumpTo(i)));

		if (!this.stepTexts.length) {
			// Defensive: nothing to step through (the accessible list is
			// missing or empty), so just hold a valid data-step.
			this.scene?.setAttribute('data-step', '1');
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) this.offscreen = !entry.isIntersecting;
				this.applyRunState();
			},
			{ threshold: 0.3 },
		);
		observer.observe(root);
		document.addEventListener('visibilitychange', () => this.applyRunState());

		this.goToStep(0);
		this.updateToggleLabel();
	}

	private get shouldRun(): boolean {
		return !this.userPaused && !this.offscreen && document.visibilityState === 'visible';
	}

	/** Advance to a fresh step: full duration, every segment reset. */
	private goToStep(i: number) {
		this.index = i;
		this.scene?.setAttribute('data-step', String(i + 1));
		if (this.subtitle) this.subtitle.textContent = this.stepTexts[i] ?? '';
		this.remainingMs = this.durations[i] ?? 3000;
		this.segments.forEach((segment, si) => {
			if (si === i) segment.setAttribute('aria-current', 'step');
			else segment.removeAttribute('aria-current');
			const fill = segment.querySelector<HTMLElement>('.story-segment-fill');
			if (!fill) return;
			fill.style.transitionDuration = '0ms';
			fill.style.transform = si < i ? 'scaleX(1)' : 'scaleX(0)';
		});
		this.applyRunState();
	}

	/**
	 * Re-evaluate whether the timer should be running, after any change
	 * to pause, offscreen, or tab-visibility state, or a fresh step: does
	 * not lose progress within the current step either way. Starting
	 * (re)arms the timeout and the active segment's fill for whatever is
	 * left of remainingMs; stopping computes how much of that just
	 * elapsed and freezes the fill in place.
	 */
	private applyRunState() {
		const wasRunning = this.timer !== null;
		this.clearTimer();
		if (this.shouldRun) {
			this.runningSince = Date.now();
			const fill = this.segments[this.index]?.querySelector<HTMLElement>('.story-segment-fill');
			if (fill) {
				// Flush the reset in goToStep (or the freeze below) before
				// animating, so the browser doesn't collapse the two
				// transform changes into one and skip the transition.
				void fill.offsetWidth;
				fill.style.transitionDuration = `${this.remainingMs}ms`;
				fill.style.transform = 'scaleX(1)';
			}
			this.timer = window.setTimeout(() => {
				this.timer = null;
				this.goToStep((this.index + 1) % this.stepTexts.length);
			}, this.remainingMs);
		} else if (wasRunning) {
			const elapsed = Date.now() - this.runningSince;
			this.remainingMs = Math.max(50, this.remainingMs - elapsed);
			this.freezeActiveSegment();
		}
	}

	private clearTimer() {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	/** Pin the active segment's fill exactly where its transition is,
	 * instead of leaving it running while the step timer is paused. */
	private freezeActiveSegment() {
		const fill = this.segments[this.index]?.querySelector<HTMLElement>('.story-segment-fill');
		if (!fill) return;
		const current = getComputedStyle(fill).transform;
		fill.style.transitionDuration = '0ms';
		fill.style.transform = current;
	}

	private toggleUserPause() {
		this.userPaused = !this.userPaused;
		this.updateToggleLabel();
		this.applyRunState();
	}

	/** Jump to a step from its progress segment. Keeps the user's pause
	 * state: a paused story shows the step and stays paused there. */
	private jumpTo(i: number) {
		if (i === this.index && this.scene) {
			// Same step: clear the attribute and force a style flush, so its
			// step-scoped keyframe animations restart from the beginning.
			this.scene.removeAttribute('data-step');
			void this.scene.offsetWidth;
		}
		this.goToStep(i);
	}

	private restart() {
		this.userPaused = false;
		this.updateToggleLabel();
		this.goToStep(0);
	}

	private updateToggleLabel() {
		if (!this.toggle) return;
		this.toggle.setAttribute('aria-label', this.userPaused ? 'Play animation' : 'Pause animation');
		this.toggle.classList.toggle('is-paused', this.userPaused);
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
	document.querySelectorAll<HTMLElement>('[data-story]').forEach((el) => new StoryController(el));
	document
		.querySelectorAll<HTMLElement>('[data-capability-explorer]')
		.forEach((el) => new CapabilityExplorer(el));
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}
