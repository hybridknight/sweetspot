import { describe, expect, it } from "vitest";
import { searchSettings, settingsPages } from "./settings-navigation";

describe("finding settings by user tasks", () => {
	it.each([
		["autostart", "/"],
		["close tray", "/"],
		["crossfade", "/player/general"],
		["bass", "/player/equalizer"],
		["media keys", "/player/controls"],
		["chromecast", "/sharing"],
		["shared links", "/sharing"],
		["mcp", "/api-integrations/mcp"],
		["ai assistant", "/api-integrations/mcp"],
		["paired clients", "/api-integrations/authentication"],
		["hardware acceleration", "/advanced"],
		["autoupdate", "/about"],
		["time codes", "/player/lyrics"],
	])("finds %s at its destination", (query, destination) => {
		expect(searchSettings(query).map((page) => page.to)).toContain(destination);
	});

	it("ignores case and extra whitespace, and requires every word", () => {
		expect(searchSettings("  HARDWARE   acceleration ").map((page) => page.to)).toEqual(["/advanced"]);
		expect(searchSettings("hardware lyrics")).toEqual([]);
	});

	it("allows clearing search and handles missing results", () => {
		expect(searchSettings("   ")).toEqual(settingsPages);
		expect(searchSettings("not-a-setting")).toEqual([]);
	});

	it("gives each destination exactly one home", () => {
		expect(new Set(settingsPages.map((page) => page.to)).size).toBe(settingsPages.length);
	});
});
