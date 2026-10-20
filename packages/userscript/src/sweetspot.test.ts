import { describe, expect, test } from "vitest";
import { SweetspotLink } from "../../../apps/sweetspot/src/shared/protocol/sweetspotProtocol";
import { toSweetspot } from "./sweetspot";

describe("browser links handed to Sweet Spot", () => {
	test.each([
		"https://music.youtube.com/watch?v=dQw4w9WgXcQ",
		"https://youtu.be/dQw4w9WgXcQ",
		"https://www.youtube.com/shorts/dQw4w9WgXcQ",
		"https://music.youtube.com/playlist?list=PLabcdefghijklmnopqrstuv",
		"https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv",
		"https://music.youtube.com/@Some_Handle",
	])("opens %s through the registered scheme", (url) => {
		const link = toSweetspot(url);
		expect(link).toMatch(/^ssytm:\/\//);
		expect(SweetspotLink.resolve(link!)).toEqual(SweetspotLink.resolve(url));
		expect(SweetspotLink.fromArgv(["sweetspot", `"${link}"`])).toBe(link);
	});

	test("does not open unrelated hosts or non-actionable pages", () => {
		expect(toSweetspot("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
		expect(toSweetspot("https://music.youtube.com/")).toBeNull();
	});
});
