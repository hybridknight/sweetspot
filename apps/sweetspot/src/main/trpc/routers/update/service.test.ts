import type { App } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(), open: vi.fn(), quit: vi.fn(), download: vi.fn(), nativeQuit: vi.fn(), downloaded: vi.fn(),
	check: vi.fn(),
}));
vi.mock("@main/core/baseProvider", () => ({ BaseProvider: class {
	logger = { debug: vi.fn(), error: vi.fn() };
	getProvider() { return { get: () => "stable", instance: { app: { autoupdate: true } } }; }
} }));
vi.mock("@main/handlers/quitHandler", () => ({ requestQuitAndInstall: mocks.quit }));
vi.mock("@main/handlers/quitPolicy", () => ({ isAppQuitting: () => false }));
vi.mock("@main/infra/devUtils", () => ({ isDevelopment: false, isProduction: true }));
vi.mock("@main/windows/windowUtils", () => ({ createAppWindow: vi.fn() }));
vi.mock("@shared/utils/filecache", () => ({ cacheWithFile: (fn: () => unknown) => fn() }));
vi.mock("@shared/utils/github", () => ({ authorName: "hybridknight", repoName: "sweetspot", githubRepoFetch: mocks.fetch }));
vi.mock("electron", () => ({ shell: { openExternal: mocks.open } }));
vi.mock("electron-updater", () => ({
	autoUpdater: { app: { baseCachePath: "/tmp/test-updater" }, checkForUpdates: mocks.check, downloadUpdate: mocks.download, quitAndInstall: mocks.nativeQuit, setFeedURL: vi.fn(), on: vi.fn(), signals: { updateDownloaded: mocks.downloaded } },
	CancellationToken: vi.fn(),
}));

import { autoUpdater } from "electron-updater";
import UpdateProvider from "./service";

const url = "https://github.com/hybridknight/sweetspot/releases/download/v1.0.3/Sweet-Spot-1.0.3-arm64.dmg";
function provider(translated = false) {
	const value = new UpdateProvider({ runningUnderARM64Translation: translated } as App);
	(value as any).setUpdate({ version: "1.0.3", releases: [], releaseName: null, releaseNotes: null, releaseDate: "" }, true);
	return value;
}
beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("process", { ...process, platform: "darwin", arch: "arm64" });
	mocks.fetch.mockResolvedValue({ data: { tag_name: "v1.0.3", assets: [{ name: "Sweet-Spot-1.0.3-arm64.dmg", browser_download_url: url }] } });
	mocks.open.mockResolvedValue(undefined);
	mocks.check.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

it("opens the matching DMG without native update download, installation, or quit", async () => {
	const updater = provider();
	updater.BeforeStart();
	expect(autoUpdater.autoInstallOnAppQuit).toBe(false);
	await expect(updater.onAutoUpdateRun()).resolves.toBe(true);
	expect(mocks.open).toHaveBeenCalledExactlyOnceWith(url);
	expect(updater.onDownloadUpdate()).toEqual([null, null]);
	await (updater as any).handleUpdateDownloaded({ version: "1.0.3" });
	expect(mocks.quit).not.toHaveBeenCalled();
	expect(mocks.nativeQuit).not.toHaveBeenCalled();
	expect(mocks.download).not.toHaveBeenCalled();
	expect(updater.isUpdateDownloaded()).toBe(false);
});
it("detects an Apple Silicon Mac even when the app runs through Rosetta", () => {
	vi.stubGlobal("process", { ...process, arch: "x64" });
	expect(provider(true).getDownloadTarget()).toEqual({ architecture: "arm64", label: "Apple Silicon" });
});
it.each(["missing", "network"])("opens the release page if the DMG cannot be resolved (%s)", async (failure) => {
	if (failure === "network") mocks.fetch.mockRejectedValueOnce(new Error("Offline"));
	else mocks.fetch.mockResolvedValueOnce({ data: { tag_name: "v1.0.3", assets: [] } });
	await expect(provider().openMacDmgDownload()).resolves.toMatchObject({ kind: "release" });
	expect(mocks.open).toHaveBeenCalledExactlyOnceWith("https://github.com/hybridknight/sweetspot/releases/tag/v1.0.3");
});
it("reports browser-opening failures to the UI without starting an installer", async () => {
	mocks.open.mockRejectedValueOnce(new Error("Could not open browser"));
	await expect(provider().openMacDmgDownload()).rejects.toThrow("Could not open browser");
	expect(mocks.quit).not.toHaveBeenCalled();
});
it("rejects calls without an offered Mac update and keeps Windows native updates enabled", async () => {
	vi.stubGlobal("process", { ...process, platform: "win32", arch: "x64" });
	const updater = provider();
	updater.BeforeStart();
	expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
	expect(updater.getDownloadTarget()).toBeNull();
	await expect(updater.openMacDmgDownload()).rejects.toThrow("No Mac update");
	expect(mocks.open).not.toHaveBeenCalled();
});

function checkProvider() {
	return new UpdateProvider({ getVersion: () => "1.0.5" } as App);
}

it.each(["1.0.5", "1.0.4"])("completes a manual check without an update when the feed offers %s", async (version) => {
	mocks.check.mockResolvedValue({ updateInfo: { version } });
	const updater = checkProvider();
	await expect(updater.onCheckUpdate({ forceDialog: true })).resolves.toBeNull();
	expect(updater.isChecking()).toBe(false);
	expect(updater.getUpdate()).toBeNull();
	expect(updater.logger.error).not.toHaveBeenCalled();
});

it.each(["network", "incomplete"])("reports a failed manual check instead of claiming the app is current (%s)", async (failure) => {
	if (failure === "network") mocks.check.mockRejectedValue(new Error("Offline"));
	else mocks.check.mockResolvedValue(null);
	const updater = checkProvider();
	await expect(updater.onCheckUpdate({ forceDialog: true })).rejects.toThrow("Could not check for updates");
	expect(updater.isChecking()).toBe(false);
});

it("keeps failed background checks quiet", async () => {
	mocks.check.mockRejectedValue(new Error("Offline"));
	await expect(checkProvider().onCheckUpdate()).resolves.toBeNull();
});

it("still returns newer updates from manual checks", async () => {
	mocks.check.mockResolvedValue({ updateInfo: { version: "1.0.6" } });
	const updater = checkProvider();
	await expect(updater.onCheckUpdate({ forceDialog: true, showDialog: false })).resolves.toMatchObject({ version: "1.0.6" });
	expect(updater.isChecking()).toBe(false);
});
