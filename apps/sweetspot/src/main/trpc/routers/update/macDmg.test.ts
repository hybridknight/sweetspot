import { describe, expect, it } from "vitest";
import { macDownloadTarget, selectMacDmg } from "./macDmg";

const options = { owner: "hybridknight", repo: "sweetspot", tag: "v1.0.3", architecture: "arm64" };
const asset = (name: string) => ({ name, browser_download_url: `https://github.com/hybridknight/sweetspot/releases/download/v1.0.3/${name}` });

describe("Mac download selection", () => {
	it.each([
		["arm64", false, "arm64", "Apple Silicon"],
		["x64", false, "x64", "Intel"],
		["x64", true, "arm64", "Apple Silicon"],
	] as const)("detects %s with Rosetta=%s", (arch, translated, architecture, label) => {
		expect(macDownloadTarget(arch, translated)).toEqual({ architecture, label });
	});
	it("selects each processor's DMG regardless of asset order", () => {
		const intel = asset("Sweet-Spot-1.0.3.dmg"), arm = asset("Sweet-Spot-1.0.3-arm64.dmg");
		expect(selectMacDmg([intel, arm], options)).toBe(arm.browser_download_url);
		expect(selectMacDmg([arm, intel], { ...options, architecture: "x64" })).toBe(intel.browser_download_url);
	});
	it("prefers an explicit Intel match and supports universal fallback", () => {
		const universal = asset("Sweet-Spot-1.0.3-universal.dmg"), intel = asset("Sweet-Spot-1.0.3-x64.dmg");
		expect(selectMacDmg([universal, intel], { ...options, architecture: "x64" })).toBe(intel.browser_download_url);
		expect(selectMacDmg([intel, universal], options)).toBe(universal.browser_download_url);
	});
	it("does not give Apple Silicon an Intel-only download or select a ZIP", () => {
		expect(selectMacDmg([asset("Sweet-Spot-1.0.3.dmg"), asset("Sweet-Spot-1.0.3-arm64.zip")], options)).toBeNull();
	});
	it.each([
		"https://example.com/app-arm64.dmg",
		"https://github.com/other/repo/releases/download/v1.0.3/app-arm64.dmg",
		"https://github.com/hybridknight/sweetspot/releases/download/v1.0.2/app-arm64.dmg",
		"https://github.com@evil.example/app-arm64.dmg",
		"file:///tmp/app-arm64.dmg",
		"not-a-url",
	])("rejects a download outside the expected release: %s", (url) => {
		expect(selectMacDmg([{ name: "app-arm64.dmg", browser_download_url: url }], options)).toBeNull();
	});
});
