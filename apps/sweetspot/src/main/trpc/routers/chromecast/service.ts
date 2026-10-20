import { startCastDiscovery, type DiscoveredReceiver } from "@main/chromecast/discovery";
import { CastDeviceSession } from "@main/chromecast/session";
import { BaseProvider, AfterInit, BeforeStart, OnDestroy } from "@main/core/baseProvider";
import { serverMain } from "@main/ipc/serverEvents";
import { getAppWindows } from "@main/lifecycle";
import { createAppDialogWindow } from "@main/windows/windowUtils";
import { createChooserLock } from "@shared/chromecast/chooser";
import { isSafeCastAppId, isSafeCastHandle, isSafeCastHost, isSafeCastPort } from "@shared/chromecast/endpoint";
import { CHROMECAST_SETTING_KEY } from "@shared/chromecast/flag";
import {
	CHROMECAST_DISCOVERY_START_CHANNEL,
	CHROMECAST_SELECT_CHANNEL,
	CHROMECAST_SESSION_CHANNEL,
	CHROMECAST_SESSION_EVENT_CHANNEL,
	type CastSessionEvent,
	type CastSessionSnapshot,
	type ChromecastSelectResult,
	type ChromecastSessionRequest,
} from "@shared/chromecast/ipc";
import { findReceiverById, isValidReceiverId, sanitizeReceiverList, sanitizeReceiverName, type ChromecastReceiverDescriptor } from "@shared/chromecast/receivers";
import { App, BrowserWindow, type IpcMainInvokeEvent, type WebContents } from "electron";

const PICKER_WIDTH = 380;
const PICKER_HEIGHT = 420;
const PICKER_TIMEOUT_MS = 60_000;
const NAMESPACE_MAX = 256;
const MESSAGE_MAX = 1_000_000;

type LiveSession = {
	session: CastDeviceSession;
	sender: WebContents;
};

export default class ChromecastProvider extends BaseProvider implements BeforeStart, AfterInit, OnDestroy {
	private lock = createChooserLock();
	private pending: ChromecastReceiverDescriptor[] = [];
	private picker: BrowserWindow | null = null;
	private settleChooser: ((result: ChromecastSelectResult) => void) | null = null;
	private pickerTimer: ReturnType<typeof setTimeout> | null = null;
	private sessions = new Map<string, LiveSession>();
	private boundSenders = new WeakSet<WebContents>();
	private discovered: DiscoveredReceiver[] = [];
	private stopDiscovery: (() => void) | null = null;

	constructor(_app: App) {
		super("chromecast");
	}

	async BeforeStart() {
		serverMain.handle(CHROMECAST_DISCOVERY_START_CHANNEL, () => {
			this.ensureDiscovery();
		});
		serverMain.handle(CHROMECAST_SELECT_CHANNEL, () => this.openChooser());
		serverMain.handle(CHROMECAST_SESSION_CHANNEL, (ev, payload: ChromecastSessionRequest) => this.handleSession(ev, payload));
	}

	async AfterInit() {
		const settings = this.getProvider("settings");
		if (settings.get(CHROMECAST_SETTING_KEY, false)) this.ensureDiscovery();
		settings.onSettingChange(CHROMECAST_SETTING_KEY, (value) => {
			if (value) this.ensureDiscovery();
		});
	}

	async OnDestroy() {
		this.stopDiscovery?.();
		this.stopDiscovery = null;
		this.discovered = [];
		this.dropAllSessions();
		this.finish({ id: null });
	}

	listPending(): ChromecastReceiverDescriptor[] {
		if (!this.lock.isOpen()) return this.pending;
		return sanitizeReceiverList(this.discovered.map((item) => ({ id: item.id, name: item.name })));
	}

	selectReceiver(id: string | null): boolean {
		if (!this.lock.isOpen()) return false;
		if (id == null) {
			this.finish({ id: null });
			return true;
		}
		const live = sanitizeReceiverList(this.discovered.map((item) => ({ id: item.id, name: item.name })));
		const match = findReceiverById(live, id) ?? findReceiverById(this.pending, id);
		this.finish({ id: match?.id ?? null });
		return !!match;
	}

	private async handleSession(ev: IpcMainInvokeEvent, payload: ChromecastSessionRequest): Promise<CastSessionSnapshot | void> {
		if (!payload || typeof payload !== "object" || typeof payload.op !== "string") {
			throw new Error("bad request");
		}
		switch (payload.op) {
			case "connect":
				return await this.connectSession(ev, payload);
			case "send": {
				if (!isSafeNamespace(payload.namespace)) throw new Error("bad message");
				this.ownedSession(ev, payload.handle).sendMessage(payload.namespace, parseMessage(payload.data));
				return;
			}
			case "volume":
				this.ownedSession(ev, payload.handle).setVolumeLevel(clampVolume(payload.level));
				return;
			case "mute":
				this.ownedSession(ev, payload.handle).setMuted(!!payload.muted);
				return;
			case "load":
				this.ownedSession(ev, payload.handle).loadMedia(payload.request);
				return;
			case "stop":
				this.ownedSession(ev, payload.handle).stop();
				return;
			default:
				throw new Error("bad request");
		}
	}

	private async connectSession(
		ev: IpcMainInvokeEvent,
		payload: Extract<ChromecastSessionRequest, { op: "connect" }>,
	): Promise<CastSessionSnapshot> {
		const found = this.discovered.find((item) => item.id === payload.receiverId);
		if (!found || !isValidReceiverId(found.id) || !isSafeCastHost(found.host) || !isSafeCastPort(found.port)) {
			throw new Error("bad endpoint");
		}
		const appId = isSafeCastAppId(payload.appId) ? payload.appId : "CC1AD845";
		const receiverName = sanitizeReceiverName(found.name);
		const session = new CastDeviceSession(receiverName, appId);
		const sender = ev.sender;
		this.bindSender(sender);
		this.sessions.set(session.handle, { session, sender });
		session.on("update", () => {
			this.pushEvent(sender, { type: "update", handle: session.handle, snapshot: session.snapshot() });
		});
		session.on("stopped", () => {
			this.sessions.delete(session.handle);
			this.pushEvent(sender, { type: "stopped", handle: session.handle });
		});
		session.on("message", (namespace: string, data: string) => {
			this.pushEvent(sender, { type: "message", handle: session.handle, namespace, data });
		});
		try {
			await session.connect({ host: found.host, port: found.port, name: receiverName });
		} catch (err) {
			this.sessions.delete(session.handle);
			throw err;
		}
		return session.snapshot();
	}

	private ownedSession(ev: IpcMainInvokeEvent, handle: unknown): CastDeviceSession {
		if (!isSafeCastHandle(handle)) throw new Error("session gone");
		const row = this.sessions.get(handle);
		if (!row || row.sender.id !== ev.sender.id) throw new Error("session gone");
		return row.session;
	}

	private bindSender(sender: WebContents): void {
		if (sender.isDestroyed() || this.boundSenders.has(sender)) return;
		this.boundSenders.add(sender);
		sender.once("destroyed", () => this.dropSessionsFor(sender));
	}

	private dropSessionsFor(sender: WebContents): void {
		for (const [handle, row] of this.sessions) {
			if (row.sender !== sender) continue;
			this.sessions.delete(handle);
			try {
				row.session.stop();
			} catch {
				/* ignore */
			}
		}
	}

	private dropAllSessions(): void {
		for (const row of this.sessions.values()) {
			try {
				row.session.stop();
			} catch {
				/* ignore */
			}
		}
		this.sessions.clear();
	}

	private pushEvent(sender: WebContents, event: CastSessionEvent): void {
		if (sender.isDestroyed()) return;
		sender.send(CHROMECAST_SESSION_EVENT_CHANNEL, event);
	}

	private ensureDiscovery(): void {
		if (this.stopDiscovery) return;
		try {
			this.stopDiscovery = startCastDiscovery((list) => {
				this.discovered = list;
			});
		} catch (err) {
			this.logger.warn("chromecast discovery failed", err);
		}
	}

	private async openChooser(): Promise<ChromecastSelectResult> {
		this.ensureDiscovery();
		if (!this.lock.open()) {
			this.logger.warn("chromecast picker already open");
			return { id: null };
		}
		this.pending = sanitizeReceiverList(this.discovered.map((item) => ({ id: item.id, name: item.name })));
		this.logger.debug("chromecast picker", { count: this.pending.length });

		return await new Promise<ChromecastSelectResult>((resolve) => {
			this.settleChooser = resolve;
			this.pickerTimer = setTimeout(() => this.finish({ id: null }), PICKER_TIMEOUT_MS);

			const parent = getAppWindows()?.main;
			if (!parent || parent.isDestroyed()) {
				this.finish({ id: null });
				return;
			}

			void createAppDialogWindow({
				parent,
				path: "/cast-receiver",
				width: PICKER_WIDTH,
				height: PICKER_HEIGHT,
				minWidth: PICKER_WIDTH,
				maxWidth: PICKER_WIDTH,
				minHeight: 280,
				maxHeight: PICKER_HEIGHT,
				maximizeable: false,
				minimizeable: false,
				showTaskBar: true,
				top: true,
				show: true,
				onResponse: () => this.finish({ id: null }),
			})
				.then((win) => {
					if (!this.lock.isOpen()) {
						if (!win.isDestroyed()) win.close();
						return;
					}
					this.picker = win;
					win.on("closed", () => {
						this.picker = null;
						this.finish({ id: null });
					});
				})
				.catch((err) => {
					this.logger.error("chromecast picker failed", err);
					this.finish({ id: null });
				});
		});
	}

	private finish(result: ChromecastSelectResult): void {
		const resolve = this.settleChooser;
		if (!this.lock.settle() && !resolve) return;
		if (this.pickerTimer) {
			clearTimeout(this.pickerTimer);
			this.pickerTimer = null;
		}
		this.settleChooser = null;
		this.pending = [];
		const win = this.picker;
		this.picker = null;
		if (win && !win.isDestroyed()) {
			win.removeAllListeners("closed");
			win.close();
		}
		resolve?.(result);
	}
}

function parseMessage(data: unknown): unknown {
	if (typeof data !== "string" || data.length > MESSAGE_MAX) throw new Error("bad message");
	try {
		return JSON.parse(data);
	} catch {
		return data;
	}
}

function clampVolume(level: unknown): number {
	if (typeof level !== "number" || !Number.isFinite(level)) return 0;
	return Math.min(1, Math.max(0, level));
}

function isSafeNamespace(namespace: unknown): namespace is string {
	return typeof namespace === "string" && namespace.length > 0 && namespace.length <= NAMESPACE_MAX && !namespace.includes("\0");
}
