import { describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { CssInjector } from "./injector";

describe("theme stylesheet replacement", () => {
	it("installs the new CSS before removing the previous CSS", async () => {
		const calls: string[] = [];
		let next = 0;
		const contents = {
			id: 1,
			insertCSS: vi.fn(async () => {
				const key = `css-${++next}`;
				calls.push(`insert ${key}`);
				return key;
			}),
			removeInsertedCSS: vi.fn(async (key: string) => {
				calls.push(`remove ${key}`);
			}),
		} as unknown as WebContents;
		const injector = new CssInjector(contents);
		await injector.inject("theme", "body {color:black}");
		await injector.inject("theme", "body {color:white}");
		expect(calls).toEqual(["insert css-1", "insert css-2", "remove css-1"]);
	});

	it("keeps the existing theme when installing its replacement fails", async () => {
		const insertCSS = vi.fn().mockResolvedValueOnce("old").mockRejectedValueOnce(new Error("navigation interrupted"));
		const removeInsertedCSS = vi.fn();
		const injector = new CssInjector({ id: 1, insertCSS, removeInsertedCSS } as unknown as WebContents);
		await injector.inject("theme", "body {color:black}");
		expect(await injector.inject("theme", "body {color:white}")).toBe(false);
		expect(removeInsertedCSS).not.toHaveBeenCalled();
		expect(injector.has("theme")).toBe(true);
	});
});
