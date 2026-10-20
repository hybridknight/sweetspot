import type { App } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	get: vi.fn(),
	onSettingChange: vi.fn(),
	unsubscribe: vi.fn(),
	register: vi.fn(),
	unregister: vi.fn(),
	prev: vi.fn().mockResolvedValue(undefined),
	next: vi.fn().mockResolvedValue(undefined),
	togglePlay: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@main/core/baseProvider", () => ({
	BaseProvider: class {
		logger = { error: vi.fn(), warn: vi.fn() };
		getProvider() { return mocks; }
	},
}));
vi.mock("@main/trpc/caller", () => ({ createMainCaller: () => ({ track: mocks }) }));
vi.mock("@main/trpc/routers/track", () => ({ trackService: {} }));
vi.mock("electron", () => ({ globalShortcut: { register: mocks.register, unregister: mocks.unregister } }));

import ShortcutService from "./service";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.get.mockImplementation((_key, fallback) => fallback);
	mocks.register.mockReturnValue(true);
	mocks.onSettingChange.mockReturnValue({ unsubscribe: mocks.unsubscribe });
});

function service() {
	return new ShortcutService({ isReady: () => true } as App);
}

function changeSetting(enabled: boolean) {
	mocks.onSettingChange.mock.calls[0][1](enabled);
}

describe("global playback shortcut preference", () => {
	it("leaves keys free when disabled", async () => {
		mocks.get.mockReturnValue(false);
		await service().OnInit();
		expect(mocks.register).not.toHaveBeenCalled();
		expect(mocks.onSettingChange).toHaveBeenCalledWith("player.globalShortcutsEnabled", expect.any(Function));
	});

	it("defaults off on macOS and on elsewhere", async () => {
		await service().OnInit();
		expect(mocks.get).toHaveBeenCalledWith("player.globalShortcutsEnabled", process.platform !== "darwin");
		expect(mocks.register).toHaveBeenCalledTimes(process.platform === "darwin" ? 0 : 3);
	});

	it("enables and disables immediately without duplicating registrations", async () => {
		mocks.get.mockReturnValue(false);
		const shortcuts = service();
		await shortcuts.OnInit();
		changeSetting(true);
		changeSetting(true);
		expect(mocks.register).toHaveBeenCalledTimes(3);
		mocks.register.mock.calls[0][1]();
		mocks.register.mock.calls[1][1]();
		mocks.register.mock.calls[2][1]();
		expect(mocks.prev).toHaveBeenCalledOnce();
		expect(mocks.next).toHaveBeenCalledOnce();
		expect(mocks.togglePlay).toHaveBeenCalledOnce();
		changeSetting(false);
		expect(mocks.unregister.mock.calls.map(([key]) => key)).toEqual([
			"Shift+Alt+Left", "Shift+Alt+Right", "Shift+Alt+Space",
		]);
		changeSetting(true);
		expect(mocks.register).toHaveBeenCalledTimes(6);
	});

	it("only releases shortcuts this service successfully registered", async () => {
		mocks.get.mockReturnValue(true);
		mocks.register.mockReturnValueOnce(false);
		const shortcuts = service();
		await shortcuts.OnInit();
		await shortcuts.OnDestroy();
		expect(mocks.unregister).not.toHaveBeenCalledWith("Shift+Alt+Left");
		expect(mocks.unregister).toHaveBeenCalledTimes(2);
		expect(mocks.unsubscribe).toHaveBeenCalledOnce();
	});

	it("subscribes once and cleans up once on repeated lifecycle calls", async () => {
		mocks.get.mockReturnValue(true);
		const shortcuts = service();
		await shortcuts.OnInit();
		await shortcuts.OnInit();
		expect(mocks.onSettingChange).toHaveBeenCalledOnce();
		expect(mocks.register).toHaveBeenCalledTimes(3);
		await shortcuts.OnDestroy();
		await shortcuts.OnDestroy();
		expect(mocks.unregister).toHaveBeenCalledTimes(3);
		expect(mocks.unsubscribe).toHaveBeenCalledOnce();
	});
});
