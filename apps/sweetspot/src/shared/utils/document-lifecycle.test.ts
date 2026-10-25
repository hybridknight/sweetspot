import { afterEach, describe, expect, it, vi } from "vitest";
import { onDocumentDiscarded } from "./document-lifecycle";

afterEach(() => vi.unstubAllGlobals());

function pageHide(persisted = false) {
	return Object.assign(new Event("pagehide"), { persisted });
}

describe("document cleanup", () => {
	it("preserves playback controls and audio settings when a reload is cancelled", () => {
		const page = new EventTarget();
		vi.stubGlobal("window", page);
		const mediaCommand = vi.fn();
		page.addEventListener("media-command", mediaCommand);
		let audioProcessingEnabled = true;
		const cleanup = vi.fn(() => {
			page.removeEventListener("media-command", mediaCommand);
			audioProcessingEnabled = false;
		});
		onDocumentDiscarded(cleanup);
		page.addEventListener("beforeunload", (event) => event.preventDefault());

		for (let attempt = 0; attempt < 3; attempt++) {
			expect(page.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(false);
			page.dispatchEvent(new Event("media-command"));
		}
		expect(mediaCommand).toHaveBeenCalledTimes(3);
		expect(audioProcessingEnabled).toBe(true);
		expect(cleanup).not.toHaveBeenCalled();

		page.dispatchEvent(pageHide());
		page.dispatchEvent(new Event("media-command"));
		page.dispatchEvent(pageHide());
		expect(mediaCommand).toHaveBeenCalledTimes(3);
		expect(audioProcessingEnabled).toBe(false);
		expect(cleanup).toHaveBeenCalledOnce();
	});

	it("keeps a cached page usable and cleans up when it is finally discarded", () => {
		const page = new EventTarget();
		vi.stubGlobal("window", page);
		const cleanup = vi.fn();
		onDocumentDiscarded(cleanup);
		page.dispatchEvent(pageHide(true));
		expect(cleanup).not.toHaveBeenCalled();
		page.dispatchEvent(pageHide());
		expect(cleanup).toHaveBeenCalledOnce();
	});
});
