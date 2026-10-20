import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "electron";
import type { TrackData } from "@shared/track/trackData";

const mocks = vi.hoisted(() => {
	const logger = { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => logger };
	return {
		logger,
		players: [] as any[],
		thumbnail: vi.fn(),
		track: {
			trackData: null as TrackData | null,
			trackState: { id: "one", playing: true, duration: 180, progress: 20 },
			playing: true,
			onTrackChange: vi.fn(),
			onTrackStateChange: vi.fn(),
			toggleTrackPlayback: vi.fn().mockResolvedValue(undefined),
			playTrack: vi.fn().mockResolvedValue(undefined),
			pauseTrack: vi.fn().mockResolvedValue(undefined),
			nextTrack: vi.fn().mockResolvedValue(undefined),
			prevTrack: vi.fn().mockResolvedValue(undefined),
			seekTrack: vi.fn().mockResolvedValue(undefined),
		},
	};
});

vi.mock("@main/core/baseProvider", () => ({
	BaseProvider: class { logger = mocks.logger; },
}));
vi.mock("@main/trpc/routers/track", () => ({ trackService: mocks.track }));
vi.mock("electron", () => ({ app: { commandLine: { appendSwitch: vi.fn() } } }));
vi.mock("@venipa/xosms", () => ({
	MediaPlayer: class {
		listeners = new Map<string, (...args: any[]) => void>();
		activate = vi.fn();
		deactivate = vi.fn();
		update = vi.fn();
		setTimeline = vi.fn();
		setThumbnail = vi.fn();
		addEventListener = vi.fn((name, callback) => this.listeners.set(name, callback));
		removeEventListener = vi.fn((name) => this.listeners.delete(name));
		constructor() { mocks.players.push(this); }
	},
	MediaPlayerPlaybackStatus: { Playing: 1, Paused: 2, Stopped: 3 },
	MediaPlayerMediaType: { Music: 1 },
	MediaPlayerThumbnailType: { Uri: 2 },
	MediaPlayerThumbnail: { create: mocks.thumbnail },
}));

import MediaControlProvider from "./service";

function track(id: string): TrackData {
	return { video: { videoId: id, title: id, author: "Artist" }, meta: { duration: 180, thumbnail: "https://example.com/art.jpg" } } as TrackData;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.players.length = 0;
	mocks.track.trackData = track("one");
	mocks.track.playing = true;
	mocks.track.trackState = { id: "one", playing: true, duration: 180, progress: 20 };
	mocks.thumbnail.mockResolvedValue({});
	mocks.track.onTrackChange.mockImplementation((callback, options) => {
		if (options?.immediate) callback(mocks.track.trackData);
		return vi.fn();
	});
	mocks.track.onTrackStateChange.mockImplementation((callback, options) => {
		if (options?.immediate) callback(mocks.track.trackState);
		return vi.fn();
	});
});

describe("native media controls", () => {
	it("keeps one native player and subscriptions across window reloads", async () => {
		const service = new MediaControlProvider({ name: "YouTube Music" } as App);
		await service.AfterInit();
		await service.AfterInit();
		expect(mocks.players).toHaveLength(1);
		expect(mocks.track.onTrackChange).toHaveBeenCalledTimes(1);
		expect(mocks.track.onTrackStateChange).toHaveBeenCalledTimes(1);
		expect(mocks.players[0].title).toBe("one");
		expect(mocks.players[0].playButtonEnabled).toBe(true);
		expect(mocks.players[0].pauseButtonEnabled).toBe(true);
	});

	it.each([
		["playpause", "toggleTrackPlayback"], ["play", "playTrack"],
		["pause", "pauseTrack"], ["stop", "pauseTrack"],
		["next", "nextTrack"], ["previous", "prevTrack"],
	] as const)("routes %s to playback once after a reload", async (button, action) => {
		const service = new MediaControlProvider({ name: "YouTube Music" } as App);
		await service.AfterInit();
		await service.AfterInit();
		mocks.players[0].listeners.get("buttonpressed")(null, button);
		expect(mocks.track[action]).toHaveBeenCalledTimes(1);
	});

	it("uses current playback state when artwork resolves and ignores older tracks", async () => {
		const service = new MediaControlProvider({ name: "YouTube Music" } as App);
		await service.AfterInit();
		let resolveOld!: (value: any) => void;
		mocks.thumbnail.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
		const oldUpdate = service.handleTrackMediaOSControlChange(track("old"));
		const current = track("current");
		mocks.track.trackData = current;
		mocks.track.playing = false;
		mocks.track.trackState.progress = 45;
		await service.handleTrackMediaOSControlChange(current);
		resolveOld({});
		await oldUpdate;
		expect(mocks.players[0].title).toBe("current");
		expect(mocks.players[0].playbackStatus).toBe(2);
		expect(mocks.players[0].setTimeline).toHaveBeenLastCalledWith(180, 45);
	});

	it("disposes subscriptions and rejects pending updates after shutdown", async () => {
		const service = new MediaControlProvider({ name: "YouTube Music" } as App);
		await service.AfterInit();
		let resolveArt!: (value: any) => void;
		mocks.thumbnail.mockReturnValueOnce(new Promise((resolve) => { resolveArt = resolve; }));
		const pending = service.handleTrackMediaOSControlChange(track("pending"));
		service.OnDestroy();
		resolveArt({});
		await pending;
		expect(mocks.players[0].title).toBe("one");
		expect(mocks.players[0].deactivate).toHaveBeenCalledTimes(1);
		expect(mocks.players[0].listeners.size).toBe(0);
		expect(mocks.track.onTrackChange.mock.results[0].value).toHaveBeenCalledOnce();
		expect(mocks.track.onTrackStateChange.mock.results[0].value).toHaveBeenCalledOnce();
		expect(service.instance).toBeNull();
	});

	it("does not restore playing state captured before artwork finished", async () => {
		const service = new MediaControlProvider({ name: "YouTube Music" } as App);
		await service.AfterInit();
		let resolveArt!: (value: any) => void;
		mocks.thumbnail.mockReturnValueOnce(new Promise((resolve) => { resolveArt = resolve; }));
		const pending = service.handleTrackMediaOSControlChange(track("one"));
		mocks.track.playing = false;
		mocks.track.trackState.progress = 60;
		resolveArt({});
		await pending;
		expect(mocks.players[0].playbackStatus).toBe(2);
		expect(mocks.players[0].setTimeline).toHaveBeenLastCalledWith(180, 60);
	});
});
