import type { CastSessionEvent, CastSessionSnapshot } from "./session";

export const CHROMECAST_SELECT_CHANNEL = "chromecast.selectReceiver";
export const CHROMECAST_SESSION_CHANNEL = "chromecast.session";
export const CHROMECAST_SESSION_EVENT_CHANNEL = "chromecast.session.event";
export const CHROMECAST_DISCOVERY_START_CHANNEL = "chromecast.discovery.start";

export type ChromecastSessionRequest =
	| { op: "connect"; receiverId: string; appId: string }
	| { op: "send"; handle: string; namespace: string; data: string }
	| { op: "volume"; handle: string; level: number }
	| { op: "mute"; handle: string; muted: boolean }
	| { op: "load"; handle: string; request: unknown }
	| { op: "stop"; handle: string };

export type { CastSessionEvent, CastSessionSnapshot };

export type ChromecastSelectResult = {
	id: string | null;
};
