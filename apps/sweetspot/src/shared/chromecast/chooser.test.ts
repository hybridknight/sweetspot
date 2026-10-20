import { describe, expect, it } from "vitest";
import { createChooserLock } from "./chooser";

describe("createChooserLock", () => {
	it("allows a single open picker", () => {
		const lock = createChooserLock();
		expect(lock.open()).toBe(true);
		expect(lock.open()).toBe(false);
		expect(lock.isOpen()).toBe(true);
		expect(lock.settle()).toBe(true);
		expect(lock.isOpen()).toBe(false);
		expect(lock.settle()).toBe(false);
		expect(lock.open()).toBe(true);
	});
});
