import { describe, expect, it } from "vitest";
import { isSafeCastAppId, isSafeCastHandle, isSafeCastHost, isSafeCastPort } from "./endpoint";

describe("isSafeCastHost", () => {
	it("accepts ipv4 and dns labels", () => {
		expect(isSafeCastHost("192.168.1.20")).toBe(true);
		expect(isSafeCastHost("Chromecast.local")).toBe(true);
	});

	it("rejects junk", () => {
		expect(isSafeCastHost("")).toBe(false);
		expect(isSafeCastHost("256.0.0.1")).toBe(false);
		expect(isSafeCastHost("host..local")).toBe(false);
		expect(isSafeCastHost("a".repeat(254))).toBe(false);
	});
});

describe("isSafeCastPort", () => {
	it("accepts 1-65535", () => {
		expect(isSafeCastPort(8009)).toBe(true);
		expect(isSafeCastPort(0)).toBe(false);
		expect(isSafeCastPort(65536)).toBe(false);
		expect(isSafeCastPort(8009.5)).toBe(false);
	});
});

describe("isSafeCastAppId", () => {
	it("accepts default receiver id", () => {
		expect(isSafeCastAppId("CC1AD845")).toBe(true);
		expect(isSafeCastAppId("bad id")).toBe(false);
	});
});

describe("isSafeCastHandle", () => {
	it("matches session handles", () => {
		expect(isSafeCastHandle("cast-1710000000000-1")).toBe(true);
		expect(isSafeCastHandle("cast-1-x")).toBe(false);
	});
});
