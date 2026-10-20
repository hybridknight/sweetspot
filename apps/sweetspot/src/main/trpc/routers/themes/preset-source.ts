import presetStyles from "./assets/presets.scss?raw";
import interactionStyles from "./assets/interactions.scss?raw";
import mnmlStyles from "./assets/mnml.scss?raw";
import interFont from "./assets/inter-latin-variable.woff2?inline";
import type { ThemePreset } from "@shared/themes/catalog";

/** Current Music uses both legacy music tokens and the newer baseline system. */
export function createPresetSource(theme: ThemePreset): string {
	const border = theme.id === "mnml" ? "#e6e6e6" : `${theme.text}38`;
	const tokens: Record<string, string> = {
		"sweetspot-theme-background": theme.background,
		"sweetspot-theme-surface": theme.surface,
		"sweetspot-theme-elevated": theme.elevated,
		"sweetspot-theme-text": theme.text,
		"sweetspot-theme-muted": theme.muted,
		"sweetspot-theme-accent": theme.accent,
		"sweetspot-theme-on-accent": theme.onAccent,
		"sweetspot-theme-border": border,
		"sweetspot-theme-radius": `${theme.radius}px`,
		"sweetspot-theme-glass": `${theme.surface}f5`,
		"sweetspot-theme-hero-scrim": `${theme.background}f5`,
		"sweetspot-theme-font": theme.font ?? (theme.id === "terminal" ? '"Courier New", monospace' : 'Roboto, "Noto Sans", Arial, sans-serif'),
	};
	const groups: [string, string[]][] = [
		[
			theme.background,
			[
				"ytmusic-background",
				"ytmusic-brand-background-solid",
				"ytmusic-brand-background-primary",
				"ytmusic-general-background-a",
				"yt-spec-base-background",
				"ytmusic-player-page-background",
				"yt-sys-color-baseline--base-background",
				"yt-deprecated-general-background-a",
				"yt-deprecated-general-background-b",
			],
		],
		[
			theme.surface,
			[
				"ytmusic-brand-background-secondary",
				"ytmusic-general-background-b",
				"ytmusic-menu-background",
				"ytmusic-dialog-background",
				"ytmusic-player-bar-background",
				"yt-spec-raised-background",
				"yt-spec-menu-background",
				"yt-sys-color-baseline--raised-background",
				"yt-sys-color-baseline--menu-background",
				"yt-deprecated-general-background-c",
			],
		],
		[
			theme.elevated,
			[
				"ytmusic-general-background-c",
				"ytmusic-search-background",
				"ytmusic-search-box-background",
				"yt-spec-badge-chip-background",
				"yt-sys-color-baseline--tonal-background",
				"yt-sys-color-baseline--additive-background",
				"yt-sys-color-baseline--button-chip-background-hover",
				"ytmusic-button-secondary-background",
			],
		],
		[
			theme.text,
			[
				"ytmusic-text-primary",
				"ytmusic-overlay-text-primary",
				"ytmusic-icon-color",
				"ytmusic-static-brand-white",
				"ytmusic-search-box-text",
				"yt-spec-text-primary",
				"yt-spec-icon-active-other",
				"yt-sys-color-baseline--text-primary",
				"yt-sys-color-baseline--overlay-text-primary",
				"yt-sys-color-baseline--wordmark-text",
				"yt-deprecated-text-primary",
				"paper-input-container-input-color",
			],
		],
		[
			theme.muted,
			[
				"ytmusic-text-secondary",
				"ytmusic-text-disabled",
				"ytmusic-overlay-text-secondary",
				"ytmusic-overlay-text-disabled",
				"ytmusic-icon-inactive",
				"yt-spec-text-secondary",
				"yt-spec-icon-inactive",
				"yt-sys-color-baseline--text-secondary",
				"yt-sys-color-baseline--text-disabled",
				"yt-sys-color-baseline--overlay-text-secondary",
				"yt-sys-color-baseline--overlay-text-disabled",
				"yt-deprecated-text-secondary",
				"paper-input-container-color",
			],
		],
		[
			theme.accent,
			[
				"ytmusic-call-to-action",
				"ytmusic-button-primary-background",
				"yt-sys-color-baseline--call-to-action",
				"yt-spec-call-to-action",
				"yt-sys-color-baseline--inverted-background",
				"yt-sys-color-baseline--inverted-background-hover",
				"paper-slider-active-color",
				"paper-slider-knob-color",
				"paper-progress-active-color",
				"paper-tabs-selection-bar-color",
				"paper-input-container-focus-color",
			],
		],
		[
			theme.onAccent,
			["ytmusic-button-primary-text-color", "yt-sys-color-baseline--text-primary-inverse", "yt-sys-color-baseline--text-secondary-inverse", "ytmusic-static-brand-black"],
		],
		[
			border,
			[
				"ytmusic-divider",
				"yt-spec-10-percent-layer",
				"yt-sys-color-baseline--outline",
				"yt-sys-color-baseline--outline-rim",
				"yt-sys-color-baseline--outline-opaque",
				"yt-sys-color-baseline--overlay-outline",
				"yt-sys-color-baseline--overlay-outline-rim",
			],
		],
	];
	for (const [value, names] of groups) for (const name of names) tokens[name] = value;
	// These gradients sit behind page text, rather than over album thumbnails.
	for (const [index, alpha] of ["00", "4d", "99", "e6", "ff"].entries()) {
		tokens[`yt-sys-color-baseline--scrim-background-gradient-${index + 1}`] = `${theme.background}${alpha}`;
	}
	return `
html, ytmusic-app, html ytmusic-dialog {
  color-scheme: ${theme.light ? "light" : "dark"};
${Object.entries(tokens)
	.map(([name, value]) => `  --${name}: ${value};`)
	.join("\n")}
  background-color: ${theme.background} !important;
  color: ${theme.text};
}
${presetStyles}
${interactionStyles}
${theme.id === "mnml" ? `@font-face { font-family: "Inter Variable"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("${interFont}") format("woff2"); }\n${mnmlStyles}` : ""}
/* Always reset the upstream white wordmark when changing light/dark presets. */
html ytmusic-app .logo.ytmusic-logo { filter: ${theme.light ? "invert(1) hue-rotate(180deg)" : "none"} !important; }

`;
}
