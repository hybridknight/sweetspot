import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ appData: "", userData: "", sessionData: "", name: "", production: false, packaged: false, appendSwitch: vi.fn() }));
vi.mock("electron", () => ({
	safeStorage: {
		isEncryptionAvailable: () => true,
		getSelectedStorageBackend: () => "gnome_libsecret",
		encryptString: (value: string) => Buffer.from(value),
		decryptString: (value: Buffer) => value.toString(),
	},
	app: {
		get isPackaged() { return state.packaged; },
		getAppPath: () => state.appData,
		commandLine: { appendSwitch: state.appendSwitch },
		setName: (name: string) => { state.name = name; },
		getPath: (key: string) => key === "appData" ? state.appData : state.userData,
		setPath: (key: string, value: string) => {
			if (key === "sessionData") state.sessionData = value;
			else state.userData = value;
		},
	},
}));
vi.mock("electron-conf/main", () => ({ Conf: class {} }));
vi.mock("./devUtils", () => ({ get isProduction() { return state.production; } }));

afterEach(() => {
	fs.rmSync(state.appData, { recursive: true, force: true });
	vi.unstubAllGlobals();
	state.packaged = false;
});

test("packaged macOS releases use the standard name and profile without bypassing Keychain", async () => {
	vi.resetModules();
	vi.stubGlobal("process", { ...process, platform: "darwin" });
	state.appData = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-release-profile-"));
	state.production = true;
	state.packaged = true;
	state.sessionData = "";
	state.appendSwitch.mockClear();
	await import("./appIdentity");
	expect(state.name).toBe("Sweet Spot");
	expect(state.userData).toBe(path.join(state.appData, "sweetspot"));
	expect(state.sessionData).toBe("");
	expect(state.appendSwitch).not.toHaveBeenCalled();
});

test.each([
	["darwin", false, false, true],
	["darwin", true, false, true],
	["darwin", false, true, false],
	["darwin", true, true, false],
	["win32", false, false, false],
	["linux", false, false, false],
] as const)("Keychain bypass is limited to unpackaged macOS builds (%s, production %s, packaged %s)", async (platform, production, packaged, bypass) => {
	vi.resetModules();
	vi.stubGlobal("process", { ...process, platform });
	state.appData = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-keychain-"));
	state.production = production;
	state.packaged = packaged;
	state.sessionData = "";
	state.appendSwitch.mockClear();
	await import("./appIdentity");
	if (bypass) {
		expect(state.appendSwitch).toHaveBeenCalledExactlyOnceWith("use-mock-keychain");
		expect(state.sessionData).toBe(path.join(state.userData, "browser-dev"));
		expect(fs.existsSync(state.sessionData)).toBe(true);
	} else {
		expect(state.appendSwitch).not.toHaveBeenCalled();
		expect(state.sessionData).toBe("");
	}
});

test.each([false, true])("encryption keys use the selected profile (production: %s)", async (production) => {
	vi.resetModules();
	state.appData = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-profile-"));
	state.userData = path.join(state.appData, "unselected-profile");
	state.production = production;
	vi.stubGlobal("process", { ...process, platform: "darwin" });
	await import("./appIdentity");
	const { getOrCreateEncryptionSecret } = await import("../lib/store/createYmlStore");
	const secret = getOrCreateEncryptionSecret("profile-check");
	const selected = path.join(state.appData, production ? "sweetspot-preview" : "sweetspot-dev");
	expect(state.name).toBe("Sweet Spot");
	expect(fs.existsSync(path.join(selected, "profile-check.key.v2"))).toBe(true);
	expect(getOrCreateEncryptionSecret("profile-check")).toBe(secret);
	expect(fs.existsSync(path.join(state.appData, "unselected-profile"))).toBe(false);
});
