import { describe, expect, it, vi } from "vitest";
import { MusicLoadGate } from "./musicLoadGate";

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

describe("music loading cover", () => {
	it("waits for theme and paint preparation before revealing", async () => {
		const gate = new MusicLoadGate();
		const styles = deferred();
		const reveal = vi.fn();
		const done = gate.complete(() => styles.promise, reveal);
		await Promise.resolve();
		expect(reveal).not.toHaveBeenCalled();
		styles.resolve();
		await done;
		expect(reveal).toHaveBeenCalledOnce();
	});
	it("coalesces duplicate ready events", async () => {
		const gate = new MusicLoadGate();
		const prepare = vi.fn(async () => {});
		const reveal = vi.fn();
		await Promise.all([gate.complete(prepare, reveal), gate.complete(prepare, reveal)]);
		expect(prepare).toHaveBeenCalledOnce();
		expect(reveal).toHaveBeenCalledOnce();
	});
	it("does not reveal a new document when an older theme request finishes", async () => {
		const gate = new MusicLoadGate();
		const oldStyles = deferred();
		const newStyles = deferred();
		const reveal = vi.fn();
		const oldLoad = gate.complete(() => oldStyles.promise, reveal);
		gate.start();
		const newLoad = gate.complete(() => newStyles.promise, reveal);
		oldStyles.resolve();
		await oldLoad;
		expect(reveal).not.toHaveBeenCalled();
		newStyles.resolve();
		await newLoad;
		expect(reveal).toHaveBeenCalledOnce();
	});
});
