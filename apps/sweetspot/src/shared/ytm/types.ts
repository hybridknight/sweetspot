/** Stable cmd targets for youtube renderer plugins. */
export type YtmCmdTarget = "api" | "lyrics" | "volume-ratio" | "equalizer";

/** Plugin -> main emit events (api.emit / sweetspot.emit). */
export type YtmEmitEvent =
	| "track:info-req"
	| "track:like-state"
	| "track:play-state"
	| "track:play-state-progress"
	| "track:title-change"
	| "app.loadEnd"
	| (string & {});

/** Main -> plugin push channels. */
export type YtmPushEvent =
	| "settingsProvider.change"
	| "trackId:change"
	| "css.thumbnail"
	| "css.thumbnail-accent"
	| (string & {});

export const YTM_READY_CHANNEL = "ssytm:cmd:is_ready";

export interface YtmPageBridge {
	emit(event: YtmEmitEvent, ...args: unknown[]): void;
	on(event: YtmPushEvent, handler: (...args: unknown[]) => void): () => void;
	settings: {
		getAll(): Promise<unknown>;
		get(key: string): Promise<unknown>;
		set(key: string, value: unknown): void;
	};
}
