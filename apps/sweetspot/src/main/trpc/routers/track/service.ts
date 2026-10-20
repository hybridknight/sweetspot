import { EventEmitter } from "node:events";
import { YtmClient } from "@main/ytm/ytm-client";
import { serverMain } from "@main/ipc/serverEvents";
import { getAppWindows, getLifecycleContext, getYoutubeView, onAfterInit, requireAppWindows } from "@main/lifecycle";
import { thumbnailCache } from "@main/services/thumbnailCache";
import IPC_EVENT_NAMES from "@shared/constants/eventNames";
import type { TrackData } from "@shared/track/trackData";
import type { PlaybackModes } from "@shared/ytm/playback-modes";
import { createLogger } from "@shared/utils/console";
import { observable } from "@trpc/server/observable";
import { ipcMain } from "electron";
import { clamp, clone, debounce } from "lodash-es";
import { Vibrant } from "node-vibrant/node";
import { firstBy } from "thenby";

export type TrackState = {
	id: string;
	playing: boolean;
	progress: number;
	uiProgress?: number;
	duration: number;
	liked: boolean;
	disliked: boolean;
	startedAt: number;
	percentage: number;
	eventType: "state" | "progress";
	accent: string | null;
};

type TrackControlResponse = { isPlaying: boolean; time: number };

type TrackEntry = { id: string } & TrackData;

const events = new EventEmitter();

class TrackCollection {
	private tracks: Map<string, TrackEntry> = new Map();
	private readonly maxSize = 24;

	addOrUpdate(id: string, value: Omit<TrackEntry, "id">, protectId?: string | null): TrackEntry {
		const track = { ...value, id } as TrackEntry;
		// Re-insert so Map order stays LRU (newest at end)
		if (this.tracks.has(id)) this.tracks.delete(id);
		this.tracks.set(id, track);

		while (this.tracks.size > this.maxSize) {
			const oldest = this.tracks.keys().next().value as string | undefined;
			if (!oldest) break;
			if (protectId && oldest === protectId) {
				// Skip protected — evict next oldest
				const keys = [...this.tracks.keys()];
				const victim = keys.find((k) => k !== protectId);
				if (!victim) break;
				this.tracks.delete(victim);
				continue;
			}
			this.tracks.delete(oldest);
		}

		return track;
	}

	remove(id: string): boolean {
		return this.tracks.delete(id);
	}

	findById(id: string): TrackEntry | undefined {
		return this.tracks.get(id);
	}

	clear(): void {
		this.tracks.clear();
	}
}

const trackCollection = new TrackCollection();

const parseTrackDuration = (td: TrackData): number | null => {
	return ((dur) => (dur ? Number.parseInt(dur) : null))(td.context?.videoDetails?.durationSeconds ?? td.video?.lengthSeconds);
};

const trackContentKey = (track: TrackData): string =>
	`${track.video.videoId}|${track.music?.album ?? ""}|${track.video.title}|${track.meta?.duration ?? ""}|${track.meta?.counterpartVideoId ?? ""}`;

const stateEmitKey = (state: TrackState): string =>
	[
		state.id,
		state.playing ? 1 : 0,
		// 250ms buckets — progress updates without flooding
		Math.floor(state.progress * 4),
		state.liked ? 1 : 0,
		state.disliked ? 1 : 0,
		state.accent ?? "",
		state.eventType,
		Math.floor(state.duration),
	].join("|");

export class TrackService {
	/** Heard title/id before TrackData + chrome (`_trackState.id`) catch up. */
	private _pendingTrackId: string | null = null;
	/** Like IPC can beat chrome id; apply when `state.id` matches. */
	private _pendingLike: { videoId: string; liked: boolean; disliked: boolean } | null = null;
	private _trackState: TrackState | null = null;
	private _trackDataCache: TrackEntry | null = null;
	private _currentPallete: { id: string; color: string } | null = null;
	private lastTrackContentKey: string | null = null;
	private lastStateEmitKey: string | null = null;
	private _ipcBound = false;
	private _styleBound = false;

	/** Settle window before notifying the socket API — UI stays instant. */
	private static readonly EXTERNAL_TRACK_DEBOUNCE_MS = 1200;

	private readonly logger = createLogger("services").child("track");

	private get app() {
		return getLifecycleContext().app;
	}

	private getProvider(name: string) {
		return getLifecycleContext().getProvider(name);
	}

	get views() {
		return requireAppWindows().views;
	}

	get windowContext() {
		return requireAppWindows();
	}

	get trackState() {
		return this._trackState;
	}

	get playing() {
		return !!this.trackState?.playing;
	}

	/** Lookup id: pending ahead of chrome, else state. */
	private get lookupTrackId(): string | null {
		return this._pendingTrackId ?? this._trackState?.id ?? null;
	}

	get trackData(): TrackEntry | null {
		const id = this.lookupTrackId;
		if (this._trackDataCache?.id === id) {
			return this._trackDataCache;
		}
		return (this._trackDataCache = id ? (trackCollection.findById(id) ?? null) : null);
	}

	bindIpcListeners(): void {
		if (this._ipcBound) return;
		this._ipcBound = true;
		// No debounce on track info — watcher already dedupes; UI must stay instant
		serverMain.on("track:info-req", (ev, data) => void this.onTrackInfo(ev, data));
		serverMain.on(IPC_EVENT_NAMES.TRACK_LIKE_STATE, (ev, data) => this.onLikeState(ev, data));
		serverMain.on("track:title-change", debounce(this.onTitleChange.bind(this), 25));
		serverMain.on(IPC_EVENT_NAMES.TRACK_PLAYSTATE, debounce(this.onPlayStateChange.bind(this), 50));
		serverMain.on(IPC_EVENT_NAMES.TRACK_PLAYSTATE_PROGRESS, debounce(this.onPlayStateProgress.bind(this), 50));
	}

	afterInit(): void {
		if (this._styleBound) return;
		if (!getYoutubeView()) return;
		this._styleBound = true;
		this.handleTrackStyle();
	}

	private log(...args: unknown[]) {
		this.logger.debug(...args);
	}

	async executeCommand<T = unknown>(command: string, ...args: unknown[]): Promise<T> {
		// api-controls plugin registers under service "api" -> plugins:api:cmd:*
		return await YtmClient.cmd<T>("api", command, ...args);
	}

	getTrackInformation(): TrackEntry | null {
		const track = this.trackData;
		if (!track) return null;
		const state = this._trackState;
		if (state && state.id === track.id) {
			track.meta.liked = state.liked;
			track.meta.disliked = state.disliked;
		}
		return track;
	}

	getTrackState(): TrackState | null {
		return this.trackState;
	}

	async postTrackLike(like: boolean): Promise<boolean | null> {
		this.patchTrackState(like ? { liked: true, disliked: false } : { liked: false });
		const liked = await this.executeCommand<boolean>("like", like);
		const resolved = typeof liked === "boolean" ? liked : like;
		this.patchTrackState(resolved ? { liked: true, disliked: false } : { liked: false });
		return resolved;
	}

	async postTrackDisLike(dislike: boolean): Promise<boolean | null> {
		this.patchTrackState(dislike ? { disliked: true, liked: false } : { disliked: false });
		const disliked = await this.executeCommand<boolean>("dislike", dislike);
		const resolved = typeof disliked === "boolean" ? disliked : dislike;
		this.patchTrackState(resolved ? { disliked: true, liked: false } : { disliked: false });
		return resolved;
	}

	async nextTrack(): Promise<TrackControlResponse> {
		return await this.executeCommand<TrackControlResponse>("next");
	}

	async prevTrack(): Promise<TrackControlResponse> {
		return await this.executeCommand<TrackControlResponse>("prev");
	}

	async repeatTrack(): Promise<TrackControlResponse & PlaybackModes> {
		return await this.executeCommand<TrackControlResponse & PlaybackModes>("repeat");
	}

	async shuffleTrack(): Promise<TrackControlResponse & PlaybackModes> {
		return await this.executeCommand<TrackControlResponse & PlaybackModes>("shuffle");
	}

	async volumeTrack(data?: { volume?: number }): Promise<{ volume: number }> {
		return await this.executeCommand<{ volume: number }>("volume", data);
	}

	async volumeUpTrack(data?: { amount?: number }): Promise<{ volume: number }> {
		return await this.executeCommand<{ volume: number }>("volumeUp", data);
	}

	async volumeDownTrack(data?: { amount?: number }): Promise<{ volume: number }> {
		return await this.executeCommand<{ volume: number }>("volumeDown", data);
	}

	async forwardTrack(_ev: unknown, data?: { time?: number }): Promise<TrackControlResponse> {
		const { time } = data ?? {};
		if (typeof time === "number" && time !== 0) {
			return await this.executeCommand<TrackControlResponse>("seek", { time });
		}
		throw new Error("Time is not a number");
	}

	async backwardTrack(_ev: unknown, data?: { time?: number }): Promise<TrackControlResponse> {
		const { time } = data ?? {};
		if (typeof time === "number" && time !== 0) {
			return await this.executeCommand<TrackControlResponse>("seek", { time: -time });
		}
		throw new Error("Time is not a number");
	}

	async seekTrack(_ev: unknown, data?: Partial<{ time: number; type?: "seek" }>): Promise<TrackControlResponse> {
		const { time, type } = data || {};
		if (typeof time !== "number") throw new Error("Time is not a number");
		return await this.executeCommand<TrackControlResponse>("seek", { time, type });
	}

	async playTrack(): Promise<TrackControlResponse> {
		return await this.executeCommand<TrackControlResponse>("play").then(({ isPlaying, time }) => {
			ipcMain.emit(IPC_EVENT_NAMES.TRACK_PLAYSTATE, null, isPlaying, time);
			return { isPlaying, time };
		});
	}

	async pauseTrack(): Promise<TrackControlResponse> {
		return await this.executeCommand<TrackControlResponse>("pause").then(({ isPlaying, time }) => {
			ipcMain.emit(IPC_EVENT_NAMES.TRACK_PLAYSTATE, null, isPlaying, time);
			return { isPlaying, time };
		});
	}

	async toggleTrackPlayback(): Promise<TrackControlResponse> {
		return await this.executeCommand<TrackControlResponse>("toggle").then(({ isPlaying, time }) => {
			ipcMain.emit(IPC_EVENT_NAMES.TRACK_PLAYSTATE, null, isPlaying, time);
			return { isPlaying, time };
		});
	}

	private ensureTrackState(): TrackState {
		if (!this._trackState) {
			this._trackState = {
				id: "",
				playing: false,
				progress: 0,
				duration: 0,
				liked: false,
				disliked: false,
				startedAt: Date.now() / 1000,
				percentage: 0,
				eventType: "state",
				accent: null,
			};
		}
		return this._trackState;
	}

	private commitTrackState(prevId: string): void {
		const state = this._trackState;
		if (!state) return;
		if (typeof state.percentage === "number") state.percentage = clamp(state.percentage, 0, 100);
		if (prevId !== state.id) {
			this.logger.debug("title id change", prevId, "=>", state.id);
			if (this._pendingTrackId && this._pendingTrackId === state.id) {
				this._pendingTrackId = null;
			}
		}
		const key = stateEmitKey(state);
		if (key === this.lastStateEmitKey) return;
		this.lastStateEmitKey = key;
		// Shallow clone — in-place mutation keeps same ref; React setState skips via Object.is.
		const snapshot = { ...state };
		events.emit("track:state-change", snapshot);
		// Local API WebSocket clients — already bucketed by stateEmitKey (~250ms).
		const api = this.getProvider("api") as { sendMessage?: (...args: unknown[]) => void } | undefined;
		api?.sendMessage?.("track:state", snapshot);
	}

	/**
	 * Merge into play-chrome store.
	 * New `id` → reset progress/accent/likes (unless patch supplies likes); preserve `playing` unless patched.
	 * Same `id` → shallow merge; omitted fields stay.
	 */
	patchTrackState(patch: Partial<TrackState>): void {
		const state = this.ensureTrackState();
		const prevId = state.id;
		const nextId = patch.id !== undefined ? String(patch.id) : state.id;
		const idChanged = nextId !== state.id;

		const pendingLike = this._pendingLike?.videoId === nextId ? this._pendingLike : null;
		if (idChanged) {
			state.id = nextId;
			state.progress = patch.progress ?? 0;
			state.uiProgress = patch.uiProgress ?? 0;
			state.percentage = patch.percentage ?? 0;
			state.startedAt = patch.startedAt ?? Date.now() / 1000;
			state.accent = patch.accent !== undefined ? patch.accent : null;
			state.liked = patch.liked ?? pendingLike?.liked ?? false;
			state.disliked = patch.disliked ?? pendingLike?.disliked ?? false;
			if (patch.duration !== undefined) state.duration = patch.duration;
			if (patch.eventType !== undefined) state.eventType = patch.eventType;
			if (patch.playing !== undefined) state.playing = patch.playing;
		} else {
			if (patch.playing !== undefined) state.playing = patch.playing;
			if (patch.progress !== undefined) state.progress = patch.progress;
			if (patch.uiProgress !== undefined) state.uiProgress = patch.uiProgress;
			if (patch.duration !== undefined) state.duration = patch.duration;
			if (patch.liked !== undefined) state.liked = patch.liked;
			if (patch.disliked !== undefined) state.disliked = patch.disliked;
			if (patch.startedAt !== undefined) state.startedAt = patch.startedAt;
			if (patch.percentage !== undefined) state.percentage = patch.percentage;
			if (patch.eventType !== undefined) state.eventType = patch.eventType;
			if (patch.accent !== undefined) state.accent = patch.accent;
		}

		this.commitTrackState(prevId);
		if (idChanged || patch.liked !== undefined || patch.disliked !== undefined) {
			this.writeTrackMetaLikes(state.id, state.liked, state.disliked);
		}
	}

	/** In-place mutator for play/progress/accent. Object form → `patchTrackState`. */
	setTrackState(fn: TrackState | ((d: TrackState) => void | TrackState)) {
		if (typeof fn !== "function") {
			this.patchTrackState(fn);
			return;
		}
		const state = this.ensureTrackState();
		const prevId = state.id;
		const ret = fn(state);
		if (ret !== undefined) {
			this._trackState = ret as TrackState;
		}
		this.commitTrackState(prevId);
	}

	async getActiveTrackByDOM(): Promise<string | null> {
		const youtubeView = getYoutubeView();
		if (!youtubeView) return null;
		try {
			const href = await youtubeView.webContents.executeJavaScript(`document.querySelector("a.ytp-title-link.yt-uix-sessionlink")?.href`);
			return href ? (new URLSearchParams(href.split("?")[1])?.get("v") ?? null) : null;
		} catch {
			return null;
		}
	}

	private writeTrackMetaLikes(videoId: string, liked: boolean, disliked: boolean): void {
		if (!videoId) return;
		const entry = trackCollection.findById(videoId);
		if (!entry) return;
		if (entry.meta.liked === liked && entry.meta.disliked === disliked) return;
		entry.meta.liked = liked;
		entry.meta.disliked = disliked;
		this._trackDataCache = null;
		const snapshot = { ...entry, meta: { ...entry.meta } };
		events.emit("track:change", snapshot);
		const api = this.getProvider("api") as { sendMessage?: (...args: unknown[]) => void } | undefined;
		api?.sendMessage?.("track:change", snapshot);
	}

	private applyLikeIfCurrent(videoId: string, liked: boolean, disliked: boolean): void {
		this._pendingLike = { videoId, liked, disliked };
		if (this._trackState?.id === videoId) {
			this.patchTrackState({ liked, disliked });
			return;
		}
		this.writeTrackMetaLikes(videoId, liked, disliked);
	}

	onLikeState(_ev: unknown, data: { videoId?: string; liked?: boolean; disliked?: boolean }) {
		const videoId = data?.videoId ? String(data.videoId) : "";
		if (!videoId) return;
		this.applyLikeIfCurrent(videoId, !!data.liked, !!data.disliked);
	}

	getTrackDuration(): number | null {
		const td = this.trackData;
		return td ? parseTrackDuration(td) : null;
	}

	async onTrackInfo(
		_ev: unknown,
		ytTrack: TrackData & { counterpartVideoId?: string | null; restartListen?: boolean },
	) {
		if (!ytTrack?.video?.videoId) return;

		const videoId = String(ytTrack.video.videoId);
		const restartListen = !!ytTrack.restartListen;
		const musicObject = ytTrack.music?.album ? { album: String(ytTrack.music.album) } : undefined;
		const duration = parseTrackDuration(ytTrack);
		const counterpartRaw = ytTrack.meta?.counterpartVideoId ?? ytTrack.counterpartVideoId;
		const counterpartVideoId =
			typeof counterpartRaw === "string" && counterpartRaw && counterpartRaw !== videoId ? counterpartRaw : null;
		const track = {
			video: ytTrack.video,
			context: ytTrack.context,
			meta: {
				thumbnail: (ytTrack?.video?.thumbnail?.thumbnails ?? ytTrack?.context?.thumbnail?.thumbnails)?.sort(firstBy((d) => d.height, "desc"))[0]?.url,
				isAudioExclusive: ytTrack?.video?.musicVideoType === "MUSIC_VIDEO_TYPE_ATV",
				counterpartVideoId,
				startedAt: Date.now() / 1000,
				duration,
				isAlbum: !!musicObject,
				liked: this._pendingLike?.videoId === videoId ? this._pendingLike.liked : this._trackState?.id === videoId ? this._trackState.liked : undefined,
				disliked: this._pendingLike?.videoId === videoId ? this._pendingLike.disliked : this._trackState?.id === videoId ? this._trackState.disliked : undefined,
			},
			music: musicObject,
		} as TrackData;

		trackCollection.addOrUpdate(videoId, track, this.lookupTrackId);
		this._trackDataCache = null;

		const knownActive =
			(!this._pendingTrackId && !this._trackState?.id) ||
			this._pendingTrackId === videoId ||
			this._trackState?.id === videoId;
		const isActive = knownActive || (await this.getActiveTrackByDOM()) === videoId;
		if (!isActive) return;

		const key = trackContentKey(track);
		const contentChanged = key !== this.lastTrackContentKey;
		const stateOutOfSync = !this._trackState || this._trackState.id !== videoId;

		// dataloaded on same videoId = new listen (loop / repeat-one)
		if (restartListen && !stateOutOfSync) {
			this._pendingTrackId = videoId;
			this.lastTrackContentKey = key;
			this.patchTrackState({
				id: videoId,
				duration: Number(duration ?? 0),
				progress: 0,
				uiProgress: 0,
				startedAt: Date.now() / 1000,
				percentage: 0,
				eventType: "state",
			});
			return;
		}

		// Same payload already fanned out — skip duplicate tRPC updates
		if (!contentChanged && !stateOutOfSync) return;

		this._pendingTrackId = videoId;
		this.lastTrackContentKey = key;

		this.pushTrackToViews(track);

		if (stateOutOfSync) {
			this.patchTrackState({
				id: videoId,
				duration: Number(duration ?? 0),
				progress: 0,
				uiProgress: 0,
				startedAt: Date.now() / 1000,
				percentage: 0,
				eventType: "state",
				accent: null,
			});
		} else if (this._pendingTrackId === videoId) {
			this._pendingTrackId = null;
		}
	}

	async setActiveTrack(trackId: string) {
		return await this.onActiveTrack(trackId);
	}

	onTitleChange(_ev: unknown, trackId: string) {
		if (trackId) void this.onActiveTrack(trackId);
	}

	private async onActiveTrack(trackId: string) {
		if (this._pendingTrackId === trackId && this._trackState?.id === trackId) return;
		if (!this._pendingTrackId && this._trackState?.id === trackId) return;

		this.log(`active track:`, trackId);
		this._pendingTrackId = trackId;
		this._trackDataCache = null;
		const td = this.trackData;
		// Wait for onTrackInfo when payload not ready — never clear pending id
		if (!td || td.video?.videoId !== trackId) {
			this.logger.debug("active track pending info", trackId);
			return;
		}

		const key = trackContentKey(td);
		if (key === this.lastTrackContentKey && this._trackState?.id === trackId) {
			this._pendingTrackId = null;
			return;
		}
		this.lastTrackContentKey = key;

		this.pushTrackToViews(td);
		this.patchTrackState({
			id: trackId,
			duration: this.getTrackDuration() ?? 0,
			progress: 0,
			uiProgress: 0,
			startedAt: Date.now() / 1000,
			percentage: 0,
			eventType: "state",
			accent: null,
		});
	}

	/**
	 * Instant UI fanout via tRPC EventEmitter.
	 * API socket updates settle separately so skipping does not block toolbar.
	 */
	pushTrackToViews(trackRef: TrackData) {
		const track = clone(trackRef);
		track.meta.startedAt = Date.now() / 1000;

		// Immediate — subscribers (toolbar / tray view) get data now
		events.emit("track:change", track);

		const windows = getAppWindows();
		if (windows) {
			try {
				YtmClient.push("trackId:change", track.video.videoId);
				windows.sendToAllViews(IPC_EVENT_NAMES.TRACK_CHANGE, track);
			} catch (error) {
				this.logger.error("Failed to fanout track to views:", error);
			}
		}

		this.queueExternalTrackPush(track);
	}

	private pendingExternal: TrackData | null = null;

	private queueExternalTrackPush(track: TrackData) {
		this.pendingExternal = track;
		this.flushExternalTrackPush();
	}

	private flushExternalTrackPush = debounce(() => {
		const pending = this.pendingExternal;
		this.pendingExternal = null;
		if (!pending) return;

		const track = pending;
		const api = this.getProvider("api") as { sendMessage?: (...args: unknown[]) => void } | undefined;
		api?.sendMessage?.("track:change", track);
	}, TrackService.EXTERNAL_TRACK_DEBOUNCE_MS);

	async onPlayStateChange(_ev: unknown, isPlaying: boolean, progressSeconds: number = 0) {
		if (!this.trackData?.meta) return;
		const duration = Number(this.trackData.meta.duration);
		const progress = Number(progressSeconds) || 0;

		this.setTrackState((state) => {
			state.playing = isPlaying;
			state.progress = progress;
			state.uiProgress = progress;
			state.percentage = duration ? (progress / duration) * 100 : 0;
			state.duration = duration;
			state.eventType = "state";
		});
	}

	async onPlayStateProgress(_ev: unknown, isPlaying: boolean, progressSeconds: number = 0) {
		if (!this.trackData?.meta) return;
		const duration = Number(this.trackData.meta.duration);
		const progress = Number(progressSeconds) || 0;
		this.setTrackState((state) => {
			state.progress = progress;
			state.uiProgress = progress;
			state.percentage = duration ? (progress / duration) * 100 : 0;
			state.playing = isPlaying;
			state.duration = duration;
			state.eventType = "progress";
		});
	}

	async getTrackAccent(track: TrackData | null = this.trackData): Promise<string | null> {
		if (!track) return null;
		const thumbnailUrl = track?.video?.thumbnail?.thumbnails?.[0]?.url;
		if (!thumbnailUrl) return null;

		const videoId = track.video.videoId;
		if (this._currentPallete && this._currentPallete.id === videoId) return this._currentPallete.color;

		const color = await thumbnailCache
			.getBuffer(thumbnailUrl)
			.then((file) => (file ? Vibrant.from(file) : null))
			.then((clr) => clr?.getPalette() ?? null)
			.then((clr) => clr?.Vibrant?.hex ?? null)
			.catch((err) => {
				this.logger.error("Error extracting accent color:", err);
				return null;
			});

		if (color) this._currentPallete = { id: videoId, color };
		return color;
	}

	onTrackStateChange(callback: (state: TrackState) => void, options: { debounce?: number; immediate?: boolean } = { immediate: false }) {
		const handler = options?.debounce ? debounce(callback, options.debounce) : callback;
		if (options.immediate && this._trackState) handler(this._trackState);
		events.on("track:state-change", handler);
		this.app.on("before-quit", () => events.off("track:state-change", handler));
		return () => events.off("track:state-change", handler);
	}

	/** Instant by default. Pass `debounce` for external subscribers. */
	onTrackChange(callback: (track: TrackData) => void, options: { debounce?: number; immediate?: boolean } = { immediate: false }) {
		const handler = options?.debounce ? debounce(callback, options.debounce) : callback;
		if (options.immediate && this.trackData) handler(this.trackData);
		events.on("track:change", handler);
		this.app.on("before-quit", () => events.off("track:change", handler));
		return () => events.off("track:change", handler);
	}

	/** tRPC subscription — service EventEmitter, not ipcMain. */
	subscribeTrack() {
		return observable<TrackData | null>((emit) => {
			const handler = (track: TrackData) => emit.next(track);
			events.on("track:change", handler);
			if (this.trackData) emit.next(this.trackData);
			return () => {
				events.off("track:change", handler);
			};
		});
	}

	/** tRPC subscription — service EventEmitter, not ipcMain. */
	subscribePlayState() {
		return observable<TrackState | null>((emit) => {
			const handler = (state: TrackState) => emit.next({ ...state });
			events.on("track:state-change", handler);
			if (this._trackState) emit.next({ ...this._trackState });
			return () => {
				events.off("track:state-change", handler);
			};
		});
	}

	private handleTrackStyle() {
		if (!this.windowContext.views.youtubeView.webContents) {
			this.logger.error("youtubeView not found");
			return;
		}
		this.onTrackChange(async (track) => {
			const trackAccent = await this.getTrackAccent(track);
			this.setTrackState((state) => {
				if (state.id !== track.video.videoId) return;
				if (state.accent === trackAccent) return;
				state.accent = trackAccent;
			});
			YtmClient.push("css.thumbnail-accent", trackAccent ?? "transparent");
			this.logger.debug("track:accent", trackAccent, track.video.thumbnail.thumbnails?.[0]?.url);
		});
		this.onTrackChange(async (track) => {
			const hqThumbnail = track.context?.thumbnail?.thumbnails?.sort(firstBy((d) => d.width, "desc"))[0]?.url ?? track.meta.thumbnail;
			const thumbnailUrl = hqThumbnail ? `url(${hqThumbnail})` : "transparent";
			YtmClient.push("css.thumbnail", thumbnailUrl);
			this.logger.debug("track:thumbnail", thumbnailUrl);
		});
	}
}

export const trackService = new TrackService();

// Bind IPC before youtube view loads — avoids dropping early track:info-req / play-state.
trackService.bindIpcListeners();

onAfterInit(() => {
	trackService.afterInit();
});
