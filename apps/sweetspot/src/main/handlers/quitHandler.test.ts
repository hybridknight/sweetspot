import { EventEmitter } from "node:events";
import type { ServiceCollection } from "@main/core/providerCollection";
import type { BrowserWindowViews } from "@main/windows/mappedWindow";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	quit: vi.fn(),
	quitAndInstall: vi.fn(),
	runLifecycle: vi.fn(),
	setTrayState: vi.fn(),
	logger: { error: vi.fn() },
}));

vi.mock("@electron-toolkit/utils", () => ({ platform: { isMacOS: true, isWindows: false } }));
vi.mock("@main/infra/devUtils", () => ({ isDevelopment: false }));
vi.mock("@main/lifecycle", () => ({ runLifecycle: mocks.runLifecycle }));
vi.mock("@shared/utils/console", () => ({ logger: mocks.logger }));
vi.mock("./trayState", () => ({ setTrayState: mocks.setTrayState }));
vi.mock("electron-updater", () => ({ autoUpdater: { quitAndInstall: mocks.quitAndInstall } }));
vi.mock("electron", async () => {
	const { EventEmitter } = await import("node:events");
	return { app: Object.assign(new EventEmitter(), { quit: mocks.quit }), powerMonitor: new EventEmitter() };
});
vi.mock("@main/ipc/serverEvents", async () => {
	const { EventEmitter } = await import("node:events");
	return { serverMain: new EventEmitter() };
});

async function setup(minimizeToTray = true) {
	const { app, powerMonitor } = await import("electron");
	const { serverMain } = await import("@main/ipc/serverEvents");
	app.removeAllListeners();
	powerMonitor.removeAllListeners();
	serverMain.removeAllListeners();
	const handler = await import("./quitHandler");
	const settings = { get: vi.fn(() => minimizeToTray), saveToDrive: vi.fn() };
	const services = { getTypedProvider: vi.fn(() => settings), exec: vi.fn().mockResolvedValue(undefined) };
	const main = Object.assign(new EventEmitter(), {
		isDestroyed: () => false,
		isVisible: () => true,
		hide: vi.fn(),
		setSkipTaskbar: vi.fn(),
	});
	handler.attachQuitHandler({ main } as unknown as BrowserWindowViews<any, any>, services as unknown as ServiceCollection);
	return { app, powerMonitor, handler, main, services, settings };
}

beforeEach(() => {
	vi.resetModules();
	vi.clearAllMocks();
	mocks.runLifecycle.mockResolvedValue(undefined);
});

describe("quit handler", () => {
	it("fully quits for the Mac DMG action even when minimize-to-tray is enabled", async () => {
		const { main, services, settings } = await setup(true);
		const { serverMain } = await import("@main/ipc/serverEvents");
		serverMain.emit("app.quit", null, true);
		await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledTimes(1));
		expect(main.hide).not.toHaveBeenCalled();
		expect(settings.saveToDrive).toHaveBeenCalledTimes(1);
		expect(services.exec).toHaveBeenCalledExactlyOnceWith("OnDestroy");
		expect(mocks.quitAndInstall).not.toHaveBeenCalled();
	});

	it.each([true, false])("allows OS shutdown immediately with minimize-to-tray=%s", async (minimizeToTray) => {
		const { app, powerMonitor, handler, main, services, settings } = await setup(minimizeToTray);
		let finishCleanup!: () => void;
		services.exec.mockReturnValue(new Promise<void>((resolve) => { finishCleanup = resolve; }));
		const shutdown = { preventDefault: vi.fn() };
		powerMonitor.emit("shutdown", shutdown);
		expect(handler.isAppQuitting()).toBe(true);
		const beforeQuit = { preventDefault: vi.fn() };
		const close = { preventDefault: vi.fn() };
		app.emit("before-quit", beforeQuit);
		main.emit("close", close);
		powerMonitor.emit("shutdown", shutdown);
		expect(shutdown.preventDefault).not.toHaveBeenCalled();
		expect(beforeQuit.preventDefault).not.toHaveBeenCalled();
		expect(close.preventDefault).not.toHaveBeenCalled();
		expect(main.hide).not.toHaveBeenCalled();
		expect(mocks.setTrayState).not.toHaveBeenCalled();
		expect(settings.saveToDrive).toHaveBeenCalledTimes(1);
		expect(services.exec).toHaveBeenCalledExactlyOnceWith("OnDestroy");
		expect(mocks.quit).not.toHaveBeenCalled();
		finishCleanup();
		await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledTimes(1));
		expect(mocks.runLifecycle).toHaveBeenCalledExactlyOnceWith("destroy");
	});

	it.each(["before-quit", "close"])("still hides to tray on a normal %s", async (eventName) => {
		const { app, main, services, handler } = await setup();
		const event = { preventDefault: vi.fn() };
		if (eventName === "close") main.emit(eventName, event);
		else app.emit(eventName, event);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		expect(main.hide).toHaveBeenCalledTimes(1);
		expect(handler.isAppQuitting()).toBe(false);
		expect(services.exec).not.toHaveBeenCalled();
	});

	it("cleans up before a normal quit when minimize-to-tray is disabled", async () => {
		const { app, services, main } = await setup(false);
		const event = { preventDefault: vi.fn() };
		app.emit("before-quit", event);
		expect(event.preventDefault).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledTimes(1));
		expect(services.exec).toHaveBeenCalledExactlyOnceWith("OnDestroy");
		expect(main.hide).not.toHaveBeenCalled();
	});

	it("keeps updater cleanup and installation idempotent if shutdown arrives", async () => {
		const { powerMonitor, handler, services } = await setup();
		const installing = handler.requestQuitAndInstall();
		powerMonitor.emit("shutdown", { preventDefault: vi.fn() });
		await installing;
		expect(services.exec).toHaveBeenCalledTimes(1);
		expect(mocks.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
		expect(mocks.quit).not.toHaveBeenCalled();
	});
});
