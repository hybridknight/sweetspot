import { describe, expect, it, vi } from "vitest";
import type { App } from "electron";
import type { ThemesConfig } from "./types";

vi.mock("@main/ytm/ytm-client", () => ({ YtmClient: {} }));
vi.mock("@main/lifecycle", () => ({ onMusicReload: vi.fn() }));

import ThemesProvider from "./service";

describe("theme style ownership", () => {
	it("removes the previous light theme after repeated startup setup and a dark-theme switch", async () => {
		const active = new Map<string, string>();
		let next = 0;
		const contents = {
			id: 1,
			isDestroyed: () => false,
			insertCSS: vi.fn(async (css: string) => {
				const key = `css-${++next}`;
				active.set(key, css);
				return key;
			}),
			removeInsertedCSS: vi.fn(async (key: string) => {
				active.delete(key);
			}),
		};
		const config: ThemesConfig = { enabled: true, selected: "mnml", customFile: null, watching: false, thumbnailBackground: false, blur: false };
		const provider = new ThemesProvider({} as App);
		provider.__registerProviders([{ getName: () => "settings", get: () => config } as never]);
		provider.__registerWindows({ views: { youtubeView: { webContents: contents } } } as never);
		await provider.reapplyAllStyles();
		await provider.reapplyAllStyles();
		config.selected = "midnight";
		await provider.updateTheme();
		const styles = [...active.values()];
		expect(styles).toHaveLength(1);
		expect(styles.filter((css) => css.includes("--sweetspot-theme-background:"))).toHaveLength(1);
		expect(styles.some((css) => css.includes("--mnml-hover-neutral"))).toBe(false);
		expect(styles.some((css) => css.includes("--sweetspot-theme-background: #080e20"))).toBe(true);
	});
});
