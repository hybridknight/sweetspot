import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackData } from "@shared/track/trackData";

const mocks = vi.hoisted(() => {
	const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger };
	return {
		logger,
		sendMessage: vi.fn(),
		sendToAllViews: vi.fn(),
		push: vi.fn(),
	};
});

vi.mock("@main/lifecycle", () => ({
	getLifecycleContext: () => ({
		app: { on: vi.fn() },
		getProvider: (name: string) => name === "api"
			? { sendMessage: mocks.sendMessage }
			: undefined,
	}),
	getAppWindows: () => ({ sendToAllViews: mocks.sendToAllViews }),
	getYoutubeView: () => null,
	requireAppWindows: vi.fn(),
	onAfterInit: vi.fn(),
}));
vi.mock("@main/ipc/serverEvents", () => ({ serverMain: { on: vi.fn() } }));
vi.mock("@main/ytm/ytm-client", () => ({ YtmClient: { push: mocks.push } }));
vi.mock("@main/services/thumbnailCache", () => ({ thumbnailCache: {} }));
vi.mock("@shared/utils/console", () => ({ createLogger: () => mocks.logger }));
vi.mock("electron", () => ({ ipcMain: { emit: vi.fn() } }));

import { TrackService } from "./service";

function track(id: string): TrackData {
	return {
		video: { videoId: id, title: id, lengthSeconds: "180" },
		meta: { duration: 180 },
	} as TrackData;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.clearAllMocks();
});
afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("playback track updates", () => {
	it("notifies views immediately and settles the latest track for the local API", async () => {
		const service = new TrackService();
		const onTrack = vi.fn();
		const unsubscribe = service.onTrackChange(onTrack);
		try {
			service.patchTrackState({ id: "first", liked: false, disliked: false });
			mocks.sendMessage.mockClear();
			await service.onTrackInfo(null, track("first"));
			expect(onTrack).toHaveBeenCalledTimes(1);
			expect(mocks.sendToAllViews).toHaveBeenCalledTimes(1);
			expect(mocks.sendMessage.mock.calls.filter(([event]) => event === "track:change")).toHaveLength(0);
			await service.onTrackInfo(null, track("first"));
			expect(onTrack).toHaveBeenCalledTimes(1);
			service.pushTrackToViews(track("second"));
			await vi.advanceTimersByTimeAsync(1200);
			const changes = mocks.sendMessage.mock.calls.filter(([event]) => event === "track:change");
			expect(changes).toHaveLength(1);
			expect(changes[0][1].video.videoId).toBe("second");
		} finally {
			unsubscribe();
		}
	});

	it("keeps pause, progress-only resume, and repeat updates", async () => {
		const service = new TrackService();
		await service.onTrackInfo(null, track("playback"));
		await service.onPlayStateChange(null, false, 40);
		expect(service.trackState).toMatchObject({ playing: false, progress: 40 });
		await service.onPlayStateProgress(null, true, 41);
		expect(service.trackState).toMatchObject({ playing: true, progress: 41 });
		await service.onTrackInfo(null, { ...track("playback"), restartListen: true });
		expect(service.trackState).toMatchObject({ id: "playback", playing: true, progress: 0 });
	});
});
