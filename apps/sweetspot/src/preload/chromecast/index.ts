import {
	CHROMECAST_DISCOVERY_START_CHANNEL,
	CHROMECAST_SELECT_CHANNEL,
	CHROMECAST_SESSION_CHANNEL,
	CHROMECAST_SESSION_EVENT_CHANNEL,
	type CastSessionEvent,
	type CastSessionSnapshot,
	type ChromecastSessionRequest,
} from "@shared/chromecast/ipc";
import { isValidReceiverId } from "@shared/chromecast/receivers";
import { createLogger } from "@shared/utils/console";
import { contextBridge, ipcRenderer, webFrame } from "electron";
import pageApiSource from "./page-api.js?raw";

const log = createLogger("chromecast");

type BridgeListener = (event: CastSessionEvent) => void;

async function injectPageApi(): Promise<void> {
	const frame = webFrame as typeof webFrame & {
		executeJavaScriptInIsolatedWorld?: (worldId: number, scripts: { code: string }[]) => Promise<unknown>;
	};
	if (typeof frame.executeJavaScriptInIsolatedWorld === "function") {
		await frame.executeJavaScriptInIsolatedWorld(0, [{ code: pageApiSource }]);
		return;
	}
	await webFrame.executeJavaScript(pageApiSource);
}

function sessionOp(payload: ChromecastSessionRequest): Promise<CastSessionSnapshot | void> {
	return ipcRenderer.invoke(CHROMECAST_SESSION_CHANNEL, payload) as Promise<CastSessionSnapshot | void>;
}

export async function startChromecastShim(): Promise<boolean> {
	const listeners = new Set<BridgeListener>();
	let appId = "";

	try {
		await ipcRenderer.invoke(CHROMECAST_DISCOVERY_START_CHANNEL);
	} catch (err) {
		log.warn("discovery start failed", err);
	}

	const emit = (event: CastSessionEvent) => {
		for (const listener of listeners) {
			try {
				listener(event);
			} catch {
				/* ignore */
			}
		}
	};

	ipcRenderer.on(CHROMECAST_SESSION_EVENT_CHANNEL, (_ev, event: CastSessionEvent) => {
		if (!event || typeof event !== "object" || typeof event.type !== "string") return;
		emit(event);
	});

	const bridge = {
		initialize: async (opts: { appId?: string }) => {
			appId = typeof opts?.appId === "string" ? opts.appId : appId;
		},
		requestSession: async (): Promise<CastSessionSnapshot | null> => {
			const result = (await ipcRenderer.invoke(CHROMECAST_SELECT_CHANNEL)) as {
				id: string | null;
			};
			if (!result?.id || !isValidReceiverId(result.id)) return null;
			const snapshot = await sessionOp({
				op: "connect",
				receiverId: result.id,
				appId: appId || "CC1AD845",
			});
			if (!snapshot) throw new Error("session gone");
			return snapshot;
		},
		sendMessage: async (handle: string, namespace: string, data: string) => {
			await sessionOp({ op: "send", handle, namespace, data });
		},
		setVolume: async (handle: string, level: number) => {
			await sessionOp({ op: "volume", handle, level });
		},
		setMuted: async (handle: string, muted: boolean) => {
			await sessionOp({ op: "mute", handle, muted });
		},
		stop: async (handle: string) => {
			await sessionOp({ op: "stop", handle });
		},
		loadMedia: async (handle: string, request: unknown) => {
			await sessionOp({ op: "load", handle, request });
		},
		onEvent: (listener: BridgeListener) => {
			listeners.add(listener);
		},
	};

	if (process.contextIsolated) {
		contextBridge.exposeInMainWorld("__sweetspotCastBridge", bridge);
	} else {
		(window as unknown as { __sweetspotCastBridge: typeof bridge }).__sweetspotCastBridge = bridge;
	}

	try {
		await injectPageApi();
	} catch (err) {
		log.warn("page api inject failed", err);
		return false;
	}

	return true;
}
