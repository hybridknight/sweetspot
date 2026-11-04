import type { App } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ production: true, mac: true, windows: false }));
vi.mock("@electron-toolkit/utils", () => ({
	platform: {
		get isMacOS() { return state.mac; },
		get isWindows() { return state.windows; },
		get isLinux() { return !state.mac && !state.windows; },
	},
}));
vi.mock("@main/infra/devUtils", () => ({
	get isProduction() { return state.production; },
	get isDevelopment() { return !state.production; },
}));
vi.mock("@main/core/baseProvider", () => ({ BaseProvider: class {} }));
vi.mock("electron", () => ({ powerSaveBlocker: { start: vi.fn() } }));

import StartupProvider from "./service";

beforeEach(() => {
	state.production = true;
	state.mac = true;
	state.windows = false;
});

function setup({ packaged = true, enabled = true, registered = false, openedAtLogin = false } = {}) {
	const app = {
		isPackaged: packaged,
		commandLine: { appendSwitch: vi.fn() },
		getLoginItemSettings: vi.fn(() => ({ openAtLogin: registered, wasOpenedAtLogin: openedAtLogin })),
		setLoginItemSettings: vi.fn(),
	};
	const onSettingChange = vi.fn();
	const provider = new StartupProvider(app as unknown as App);
	Object.defineProperty(provider, "settingsInstance", { value: {
		instance: { app: { autostart: enabled } }, onSettingChange,
	} });
	return { app, provider, onSettingChange };
}

describe("login registration", () => {
	it.each([false, true])("unpackaged runs never register Electron, including production previews (%s)", async (production) => {
		state.production = production;
		const { app, provider, onSettingChange } = setup({ packaged: false });
		await provider.AfterInit();
		expect(app.setLoginItemSettings).not.toHaveBeenCalled();
		expect(onSettingChange).not.toHaveBeenCalled();
	});

	it("removes an existing bare Electron login item without changing the autostart preference", async () => {
		const { app, provider, onSettingChange } = setup({ packaged: false, registered: true });
		await provider.AfterInit();
		expect(app.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({ openAtLogin: false });
		expect(provider.isEnabled).toBe(true);
		expect(onSettingChange).not.toHaveBeenCalled();
	});

	it.each([false, true])("packaged macOS startup follows the preference (%s)", async (enabled) => {
		const { app, provider, onSettingChange } = setup({ enabled });
		await provider.AfterInit();
		expect(app.setLoginItemSettings).toHaveBeenCalledExactlyOnceWith({ openAtLogin: enabled });
		const [key, toggle] = onSettingChange.mock.calls[0];
		expect(key).toBe("app.autostart");
		toggle(!enabled);
		expect(app.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: !enabled });
	});

	it("keeps Windows login launch arguments for the packaged executable", async () => {
		state.mac = false;
		state.windows = true;
		const { app, provider } = setup();
		await provider.AfterInit();
		expect(app.setLoginItemSettings).toHaveBeenCalledWith({
			openAtLogin: true, path: process.execPath, args: expect.arrayContaining(["--startup"]),
		});
	});

	it("does not call unsupported login-item APIs on Linux", async () => {
		state.mac = false;
		const { app, provider } = setup();
		await provider.AfterInit();
		expect(app.getLoginItemSettings).not.toHaveBeenCalled();
		expect(app.setLoginItemSettings).not.toHaveBeenCalled();
	});
});

describe("macOS login launch detection", () => {
	it.each([false, true])("uses the OS login flag without requiring --startup (%s)", (openedAtLogin) => {
		const { provider } = setup({ openedAtLogin });
		expect(provider.isStartupContext).toBe(openedAtLogin);
	});

	it("does not treat the shared development runtime as a packaged login launch", () => {
		const { provider, app } = setup({ packaged: false, openedAtLogin: true });
		expect(provider.isStartupContext).toBe(false);
		expect(app.getLoginItemSettings).not.toHaveBeenCalled();
	});
});
