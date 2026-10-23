import { THEME_PRESETS } from "@shared/themes/catalog";
import { compileString } from "sass";
import { beforeAll, describe, expect, it } from "vitest";
import lyricsCss from "../../../../../renderer-plugins/youtube/lyrics/styles.css?raw";
import { BUNDLED_THEMES } from "../registry";
import { type ContrastSample, measureContrast, runBrowserCases } from "./browser";
import fixture from "./fixtures/contrast.html?raw";

interface Snapshot {
	samples: ContrastSample[];
	baseline: string;
}
const snapshots = new Map<string, Snapshot>();
const read = (selector: string) => `({ samples: (${measureContrast.toString()})(${JSON.stringify(selector)}), baseline: getComputedStyle(document.documentElement).getPropertyValue("--yt-sys-color-baseline--text-primary").trim() })`;

beforeAll(async () => {
	const cases = THEME_PRESETS.map(theme => ({
		id: theme.id,
		css: `${compileString(BUNDLED_THEMES[theme.id].source).css}\n${lyricsCss}`,
		evaluate: read("[data-check]"),
	}));
	// Revisit mounted lyrics after the full palette sequence, without reloading.
	for (const id of ["mnml", "midnight"]) cases.push({ ...cases.find(c => c.id === id)!, id: `switch-${id}` });
	for (const [id, background, text, muted] of [
		["native-light", "#fafafa", "#111111", "#545454"],
		["native-dark", "#161619", "#ffffff", "#b5b5c0"],
	]) cases.push({
		id,
		css: `html { background: ${background}; --ytmusic-text-primary: ${text}; --ytmusic-text-secondary: ${muted}; }\n${lyricsCss}`,
		evaluate: read("#sweetspot-lyrics-root [data-check]"),
	});
	for (const [id, result] of await runBrowserCases<Snapshot>(cases, fixture)) snapshots.set(id, result);
}, 60_000);

function expectReadable(samples: ContrastSample[]) {
	for (const sample of samples) expect(sample.contrast, `${sample.label}: ${sample.color}, text fill ${sample.fill}`).toBeGreaterThanOrEqual(4.5);
}

describe("rendered theme contrast", () => {
	it.each(THEME_PRESETS)("keeps $name lyrics readable, including text fill and progress", theme => {
		const samples = snapshots.get(theme.id)!.samples;
		expect(samples.map(s => s.label)).toEqual(expect.arrayContaining([
			"inactive line", "active line", "plain lyrics", "timecode", "provider", "status", "hint", "loading", "spinner", "line progress", "sung word", "current word", "upcoming word", "word progress",
		]));
		expectReadable(samples.filter(s => !s.label.startsWith("comment") && !["author", "inactive tab", "lyric credit", "queue hint", "track number", "playlist save", "chart region"].includes(s.label)));
		expect(samples.find(s => s.label === "word progress")!.gradient).not.toBe("none");
	});

	it.each(THEME_PRESETS)("keeps $name comments and page controls readable despite upstream colors", theme => {
		const samples = snapshots.get(theme.id)!.samples;
		const labels = ["comment count", "author", "comment", "comment link", "comment date", "comment placeholder", "inactive tab", "lyric credit", "queue hint", "track number", "playlist save", "chart region"];
		expect(samples.map(s => s.label)).toEqual(expect.arrayContaining(labels));
		expectReadable(samples.filter(s => labels.includes(s.label)));
		expect(snapshots.get(theme.id)!.baseline).toBe(theme.text);
	});

	it("updates already-mounted lyrics when switching from light to dark themes", () => {
		for (const id of ["mnml", "midnight"]) {
			expect(snapshots.get(`switch-${id}`)).toEqual(snapshots.get(id));
		}
		expect(snapshots.get("switch-mnml")!.samples.find(s => s.label === "active line")!.color).not.toBe(snapshots.get("switch-midnight")!.samples.find(s => s.label === "active line")!.color);
	});

	it.each(["native-light", "native-dark"])("uses the %s Music palette when built-in themes are disabled", id => {
		const samples = snapshots.get(id)!.samples;
		expect(samples.length).toBeGreaterThanOrEqual(14);
		expectReadable(samples);
	});
});
