import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
vi.mock("@main/infra/devUtils", () => ({ isDevelopment: false }));
import { isTrustedTrpcSender } from "./sender";
function event(url: string, subframe = false) {
	const mainFrame = { url };
	return { sender: { mainFrame, isDestroyed: () => false }, senderFrame: subframe ? { url } : mainFrame } as unknown as Parameters<typeof isTrustedTrpcSender>[0];
}
describe("app router sender authorization", () => {
	it("accepts app UI and player entry points in the same frame", () => {
		for (const file of ["index.html", "player.html"]) expect(isTrustedTrpcSender(event(pathToFileURL(join(__dirname, "../renderer", file)).href + "#/settings"))).toBe(true);
	});
	it("rejects remote pages, arbitrary local files, missing frames and subframes", () => {
		for (const url of ["https://accounts.google.com/", "https://music.youtube.com/", "file:///tmp/index.html", "about:blank"]) expect(isTrustedTrpcSender(event(url))).toBe(false);
		const local = pathToFileURL(join(__dirname, "../renderer/index.html")).href;
		expect(isTrustedTrpcSender(event(local, true))).toBe(false);
		expect(isTrustedTrpcSender({ ...event(local), senderFrame: null })).toBe(false);
	});
});
