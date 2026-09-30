import type { AgentletTheme } from 'agentlet-core';

/**
 * Brand theme, light and dark, shared by the on-site demo loader
 * (src/scripts/demo-loader.ts, which picks one from agentlet.io's own
 * `data-theme`) and the known-sites loader (src/scripts/known-sites-loader.ts,
 * which picks one from `prefers-color-scheme`). Mirrors the tokens in src/styles/landing.css
 * and src/styles/starlight-theme.css by value (both are hand-authored from
 * the same brand kit): read live from those files' custom properties
 * instead of duplicating the values here, custom properties would not
 * exist at all on a Starlight page, which only defines the `--sl-color-*`
 * set, so the values are copied here and must be kept in sync by hand if
 * the brand kit changes.
 */
export const FONT_FAMILY =
	"'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const LIGHT_THEME: Partial<AgentletTheme> = {
	primaryColor: '#f4a261',
	secondaryColor: '#0f3350',
	backgroundColor: '#ffffff',
	contentBackground: '#f4f6f8',
	textColor: '#3d4f5e',
	borderColor: '#d9e0e6',
	headerBackground: '#0f3350',
	headerTextColor: '#ffffff',
	// No dialogHeaderBackground/dialogHeaderTextColor here: agentlet-core's
	// ThemeManager.processThemeConfig() now inherits both from
	// headerBackground/headerTextColor whenever the dialog-specific keys are
	// left unset, so every dialog's header already reads the same as the
	// panel's own header without repeating the two colours above.
	//
	// actionButtonBackground/Border/Text/Hover style every button in the
	// panel's footer actions bar (agentlet-core's UIManager.createActionsArea()
	// and createActionButton()/createDiscreteCloseButton(): they all share the
	// same .agentlet-action-btn class, with no separate token for the close
	// button). Settings and help are turned off below (showSettingsButton/
	// showHelpButton), leaving only the close button here, so these tokens
	// only ever apply to it in practice. A quiet icon button (transparent
	// background, the panel's own border and text colours) reads as chrome,
	// not a second call to action next to the accent-orange "Try it" buttons
	// the panel content uses; the accent colour used to double as this
	// button's fill too, which made it compete with those.
	actionButtonBackground: 'transparent',
	actionButtonBorder: '#d9e0e6',
	actionButtonHover: '#f4f6f8',
	actionButtonText: '#3d4f5e',
	borderRadius: '8px',
	fontFamily: FONT_FAMILY,
};

export const DARK_THEME: Partial<AgentletTheme> = {
	primaryColor: '#f4a261',
	secondaryColor: '#e6edf2',
	backgroundColor: '#0b1a26',
	contentBackground: '#16293a',
	textColor: '#e6edf2',
	borderColor: '#24394d',
	headerBackground: '#f4a261',
	headerTextColor: '#0f3350',
	// See the comment on LIGHT_THEME's own headerBackground/headerTextColor
	// above: the dialog-specific colours are inherited from these, no need
	// to repeat them here either.
	//
	// See the comment on LIGHT_THEME's own actionButtonBackground/Border/
	// Text/Hover above for why these are a quiet icon button rather than
	// the accent colour.
	actionButtonBackground: 'transparent',
	actionButtonBorder: '#24394d',
	actionButtonHover: '#16293a',
	actionButtonText: '#e6edf2',
	borderRadius: '8px',
	fontFamily: FONT_FAMILY,
};
