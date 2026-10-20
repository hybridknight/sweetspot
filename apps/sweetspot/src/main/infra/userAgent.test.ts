import { expect, test, vi } from "vitest";
import { buildChromeUserAgent, toChromeUserAgent } from "./userAgent";

vi.mock("electron", () => ({ app: { getName: () => "Sweet Spot" } }));

const base = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)";
test.each(["Sweet Spot", "SweetSpot", "sweetspot"])("removes %s and Electron tokens for YouTube requests", (name) => {
	const ua = toChromeUserAgent(`${base} ${name}/1.0.0 Chrome/149.0.0.0 Electron/43.3.0 Safari/537.36`, "150.0.7871.212");
	expect(ua).toBe(`${base} Chrome/150.0.7871.212 Safari/537.36`);
});
test("falls back to a valid Chrome user agent for malformed input", () => {
	expect(toChromeUserAgent("invalid", "150.0.7871.212")).toBe(buildChromeUserAgent("150.0.7871.212"));
});
