import type { PlaybackModes } from "@shared/ytm/playback-modes";
import { resolveYtmStore } from "./ytm-store";

export function readPlaybackModes(): PlaybackModes {
	const queue = resolveYtmStore()?.getState().queue;
	return {
		repeatMode: queue?.repeatMode === "NONE" ? "off" : queue?.repeatMode === "ALL" ? "all" : queue?.repeatMode === "ONE" ? "one" : null,
		shuffleEnabled: typeof queue?.shuffleEnabled === "boolean" ? queue.shuffleEnabled : null,
	};
}

/** Use the native queue controls, including their off/all/one repeat cycle. */
export async function changePlaybackMode(kind: "repeat" | "shuffle"): Promise<PlaybackModes> {
	const before = readPlaybackModes();
	const selector = kind === "repeat"
		? "ytmusic-player-bar .repeat button, ytmusic-player-bar #button-shape-repeat button"
		: "ytmusic-player-bar .shuffle button, ytmusic-player-bar #button-shape-shuffle button, ytmusic-player-bar .expand-shuffle button";
	const button = [...document.querySelectorAll<HTMLButtonElement>(selector)]
		.find(element => !element.disabled && element.getAttribute("aria-disabled") !== "true");
	if (!button) throw new Error(`${kind === "repeat" ? "Repeat" : "Shuffle"} is unavailable. Try again when the player is ready.`);
	button.click();
	const key = kind === "repeat" ? "repeatMode" : "shuffleEnabled";
	for (let attempt = 0; attempt < 20; attempt++) {
		await new Promise(resolve => setTimeout(resolve, 50));
		const after = readPlaybackModes();
		if (after[key] !== null && after[key] !== before[key]) return after;
	}
	throw new Error(`${kind === "repeat" ? "Repeat" : "Shuffle"} did not change. Please try again.`);
}
