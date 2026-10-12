// Single source of truth for the site-wide "Pause animations" state.
//
// The state lives on <html> as data-animations="paused"|"playing" (applied
// before first paint by the inline script in src/layouts/LandingLayout.astro,
// which cannot import this module and so repeats the storage key). Every
// control that pauses or resumes animations goes through
// setAnimationsPaused(): the header toggle (AnimationsToggle.astro) and the
// play control shown over the demo videos while paused (Demo.astro). The
// scenes, the hero audience rotation and the videos react to the
// "agentlet:animations-change" event this dispatches, and the CSS reacts to
// the attribute, so no control needs to know about any other.
//
// prefers-reduced-motion is deliberately not consulted, by product decision
// (see src/scripts/scenes.ts and src/scripts/hero-audience.ts).

export const ANIMATIONS_STORAGE_KEY = 'agentlet-animations';
export const ANIMATIONS_CHANGE_EVENT = 'agentlet:animations-change';

export interface AnimationsChangeDetail {
	paused: boolean;
}

/** True while animations are paused site-wide. */
export function isAnimationsPaused(): boolean {
	return document.documentElement.dataset.animations === 'paused';
}

/** Pause or resume animations site-wide, remember the choice, and tell listeners. */
export function setAnimationsPaused(paused: boolean): void {
	document.documentElement.dataset.animations = paused ? 'paused' : 'playing';
	try {
		localStorage.setItem(ANIMATIONS_STORAGE_KEY, paused ? 'paused' : 'playing');
	} catch {
		// localStorage may be unavailable (private browsing, blocked storage).
	}
	document.dispatchEvent(
		new CustomEvent<AnimationsChangeDetail>(ANIMATIONS_CHANGE_EVENT, { detail: { paused } }),
	);
}
