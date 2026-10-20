import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ display: { id: 1, scaleFactor: 2 } }));
vi.mock("electron", async () => {
	const { EventEmitter } = await import("node:events");
	return {
		screen: Object.assign(new EventEmitter(), { getDisplayMatching: vi.fn(() => ({ ...native.display })) }),
		WebContentsView: class {
			webContents = { isDestroyed: () => false };
			bounds = { x: 0, y: 40, width: 800, height: 560 };
			getBounds() { return { ...this.bounds }; }
			setBounds = vi.fn((bounds) => { this.bounds = { ...bounds }; });
		},
	};
});

import { screen, WebContentsView, type BrowserWindow } from "electron";
import { bindWindowDisplayScale } from "./displayScale";

describe("monitor transitions", () => {
	let events: EventEmitter;
	let view: WebContentsView;
	let layout: ReturnType<typeof vi.fn<() => void>>;
	beforeEach(() => {
		vi.useFakeTimers();
		native.display = { id: 1, scaleFactor: 2 };
		events = new EventEmitter();
		view = new WebContentsView();
		layout = vi.fn();
		const win = Object.assign(events, {
			getBounds: () => ({ x: 10, y: 10, width: 800, height: 600 }),
			isDestroyed: () => false,
			contentView: { children: [view] },
		}) as unknown as BrowserWindow;
		bindWindowDisplayScale(win, layout);
	});
	afterEach(() => {
		events.emit("closed");
		vi.useRealTimers();
	});

	it("refreshes both directions without changing logical bounds", () => {
		const original = view.getBounds();
		for (const display of [{ id: 2, scaleFactor: 1 }, { id: 1, scaleFactor: 2 }]) {
			native.display = display;
			events.emit("move");
			vi.advanceTimersByTime(100);
			expect(view.getBounds()).toEqual(original);
		}
		expect(layout).toHaveBeenCalledTimes(2);
		expect(view.setBounds).toHaveBeenCalledTimes(4);
		expect(view.setBounds).toHaveBeenNthCalledWith(1, { ...original, width: original.width + 1 });
		expect(view.setBounds).toHaveBeenNthCalledWith(2, original);
	});

	it("does not refresh for ordinary movement or resize on the same display", () => {
		events.emit("move");
		events.emit("resize");
		vi.advanceTimersByTime(100);
		expect(layout).not.toHaveBeenCalled();
		expect(view.setBounds).not.toHaveBeenCalled();
	});

	it("coalesces movement and handles an OS scale change on the current display", () => {
		native.display = { id: 1, scaleFactor: 1.5 };
		events.emit("move");
		vi.advanceTimersByTime(50);
		screen.emit("display-metrics-changed", {}, native.display, ["scaleFactor"]);
		vi.advanceTimersByTime(100);
		expect(layout).toHaveBeenCalledTimes(1);
	});

	it("handles display disconnection and skips destroyed views", () => {
		native.display = { id: 2, scaleFactor: 1 };
		vi.spyOn(view.webContents, "isDestroyed").mockReturnValue(true);
		screen.emit("display-removed", {}, { id: 1 });
		vi.advanceTimersByTime(100);
		expect(layout).toHaveBeenCalledTimes(1);
		expect(view.setBounds).not.toHaveBeenCalled();
	});

	it("cancels pending work and removes global listeners on close", () => {
		native.display = { id: 2, scaleFactor: 1 };
		events.emit("move");
		events.emit("closed");
		vi.advanceTimersByTime(200);
		expect(layout).not.toHaveBeenCalled();
		for (const name of ["display-metrics-changed", "display-added", "display-removed"])
			expect(screen.listenerCount(name)).toBe(0);
	});
});
