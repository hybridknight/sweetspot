import { describe, expect, it } from "vitest";
import { compileString } from "sass";
import { THEME_PRESETS } from "@shared/themes/catalog";
import { BUNDLED_THEMES, listThemes, resolveActiveSource } from "./registry";
import type { ThemesConfig } from "./types";

const config: ThemesConfig = {
	enabled: true,
	selected: "default",
	customFile: null,
	watching: false,
};

function luminance(hex: string): number {
	const channels = hex
		.slice(1)
		.match(/../g)!
		.map((v) => {
			const n = parseInt(v, 16) / 255;
			return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
		});
	return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a: string, b: string) {
	const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("bundled music themes", () => {
	it("offers ten unique built-ins plus custom and preserves the default setting", () => {
		expect(THEME_PRESETS).toHaveLength(10);
		expect(new Set(THEME_PRESETS.map((t) => t.id)).size).toBe(10);
		expect(listThemes()).toHaveLength(11);
		expect(listThemes().slice(0, 2).map((theme) => theme.id)).toEqual(["default", "mnml"]);
		expect(listThemes().some((theme) => theme.id === "contrast")).toBe(false);
		expect(resolveActiveSource(config)?.id).toBe("default");
	});
	it.each(THEME_PRESETS)("compiles $name into a resolvable stylesheet with its preview palette", (theme) => {
		const source = resolveActiveSource({
			...config,
			selected: theme.id as ThemesConfig["selected"],
		});
		expect(source?.type).toBe("string");
		const css = compileString(BUNDLED_THEMES[theme.id].source).css;
		expect(css).toContain(`--ytmusic-text-primary: ${theme.text}`);
		expect(css).toContain(`--ytmusic-background: ${theme.background}`);
		expect(css).toContain(`--yt-sys-color-baseline--text-primary: ${theme.text}`);
		expect(css).toContain(`--yt-sys-color-baseline--text-secondary: ${theme.muted}`);
		expect(css).toContain(`--yt-sys-color-baseline--menu-background: ${theme.surface}`);
		expect(css).toContain(`--yt-sys-color-baseline--text-primary-inverse: ${theme.onAccent}`);
		expect(css).toContain(`filter: ${theme.light ? "invert(1) hue-rotate(180deg)" : "none"} !important`);
		expect(css).not.toContain("$playerBarBackground");
	});
	it.each(THEME_PRESETS)("keeps $name text and controls legible on opaque palette surfaces", (theme) => {
		for (const background of [theme.background, theme.surface, theme.elevated]) {
			expect(contrast(theme.text, background)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(theme.muted, background)).toBeGreaterThanOrEqual(4.5);
			expect(contrast(theme.accent, background)).toBeGreaterThanOrEqual(3);
		}
		expect(contrast(theme.onAccent, theme.accent)).toBeGreaterThanOrEqual(4.5);
	});
	it("disables only the theme and retains custom-file resolution", () => {
		expect(resolveActiveSource({ ...config, enabled: false })).toBeNull();
		expect(resolveActiveSource({ ...config, selected: "custom" })).toBeNull();
		expect(resolveActiveSource({ ...config, selected: "custom", customFile: "/tmp/example.scss" })).toEqual({ type: "file", id: "custom", value: "/tmp/example.scss" });
		expect(resolveActiveSource({ ...config, selected: "removed" as ThemesConfig["selected"] })).toBeNull();
	});
});
