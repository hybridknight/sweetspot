import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changePlaybackMode, readPlaybackModes } from "./playback-modes.page";

const native = vi.hoisted(() => ({ queue: { repeatMode: "NONE", shuffleEnabled: false } }));
vi.mock("./ytm-store", () => ({ resolveYtmStore: () => ({ getState: () => ({ queue: native.queue }) }) }));

let buttons: Record<string, { disabled: boolean; getAttribute: () => null; click: ReturnType<typeof vi.fn> }>;
beforeEach(() => {
	vi.useFakeTimers();
	native.queue = { repeatMode: "NONE", shuffleEnabled: false };
	buttons = {
		repeat: { disabled: false, getAttribute: () => null, click: vi.fn(() => {
			native.queue.repeatMode = ({ NONE: "ALL", ALL: "ONE", ONE: "NONE" })[native.queue.repeatMode as "NONE" | "ALL" | "ONE"];
		}) },
		shuffle: { disabled: false, getAttribute: () => null, click: vi.fn(() => { native.queue.shuffleEnabled = !native.queue.shuffleEnabled; }) },
	};
	vi.stubGlobal("document", { querySelectorAll: (selector: string) => selector.includes(".repeat button") ? [buttons.repeat] : selector.includes(".shuffle button") ? [buttons.shuffle] : [] });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function change(kind: "repeat" | "shuffle") {
	const result = changePlaybackMode(kind);
	await vi.advanceTimersByTimeAsync(50);
	return result;
}

describe("native playback mode controls", () => {
	it("cycles the actual queue repeat mode off → all → one → off", async () => {
		expect((await change("repeat")).repeatMode).toBe("all");
		expect((await change("repeat")).repeatMode).toBe("one");
		expect((await change("repeat")).repeatMode).toBe("off");
		expect(buttons.repeat.click).toHaveBeenCalledTimes(3);
	});
	it("toggles shuffle in both directions without relying on translated labels", async () => {
		expect((await change("shuffle")).shuffleEnabled).toBe(true);
		expect((await change("shuffle")).shuffleEnabled).toBe(false);
	});
	it("reads changes made in full mode rather than storing a separate skin state", () => {
		native.queue = { repeatMode: "ONE", shuffleEnabled: true };
		expect(readPlaybackModes()).toEqual({ repeatMode: "one", shuffleEnabled: true });
	});
	it("does not interpret an unknown repeat mode as off", () => {
		native.queue.repeatMode = "UNAVAILABLE";
		expect(readPlaybackModes().repeatMode).toBeNull();
	});
	it("rejects missing or disabled controls instead of reporting success", async () => {
		buttons.shuffle.disabled = true;
		await expect(changePlaybackMode("shuffle")).rejects.toThrow("unavailable");
		expect(buttons.shuffle.click).not.toHaveBeenCalled();
		vi.stubGlobal("document", { querySelectorAll: () => [] });
		await expect(changePlaybackMode("repeat")).rejects.toThrow("unavailable");
	});
	it("reports when a native click fails to change playback state", async () => {
		buttons.repeat.click.mockImplementation(() => {});
		const result = expect(changePlaybackMode("repeat")).rejects.toThrow("did not change");
		await vi.advanceTimersByTimeAsync(1000);
		await result;
	});
});
