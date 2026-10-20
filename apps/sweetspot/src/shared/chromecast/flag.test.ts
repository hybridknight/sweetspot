import { describe, expect, it } from "vitest";
import { chromecastArgvFor, isChromecastEnabledFromArgv } from "./flag";

describe("isChromecastEnabledFromArgv", () => {
	it("defaults off", () => {
		expect(isChromecastEnabledFromArgv([])).toBe(false);
		expect(isChromecastEnabledFromArgv(["--sweetspot-chromecast=0"])).toBe(false);
	});

	it("enables only on explicit flag", () => {
		expect(isChromecastEnabledFromArgv(["--sweetspot-chromecast=1"])).toBe(true);
		expect(isChromecastEnabledFromArgv(["--sweetspot-chromecast"])).toBe(true);
	});

	it("ignores unrelated args", () => {
		expect(isChromecastEnabledFromArgv(["--type=renderer", "--sweetspot-chromecast=false"])).toBe(false);
	});
});

describe("chromecastArgvFor", () => {
	it("emits 0/1 tokens", () => {
		expect(chromecastArgvFor(true)).toBe("--sweetspot-chromecast=1");
		expect(chromecastArgvFor(false)).toBe("--sweetspot-chromecast=0");
	});
});
