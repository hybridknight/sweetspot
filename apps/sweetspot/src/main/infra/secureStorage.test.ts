import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	packaged: true,
	show: vi.fn(), available: vi.fn(), encrypt: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { get isPackaged() { return state.packaged; } },
	dialog: { showMessageBox: state.show },
	safeStorage: { isAsyncEncryptionAvailable: state.available, encryptStringAsync: state.encrypt },
}));
beforeEach(() => {
	vi.resetModules(); vi.clearAllMocks();
	vi.stubGlobal("process", { ...process, platform: "darwin" });
	state.packaged = true;
	state.available.mockResolvedValue(true);
	state.encrypt.mockResolvedValue(Buffer.from("protected"));
});
afterEach(() => vi.unstubAllGlobals());

it("initializes once without an app dialog, including across launches", async () => {
	for (let launch = 0; launch < 2; launch++) {
		vi.resetModules();
		let finishEncryption!: (value: Buffer) => void;
		state.encrypt.mockReturnValueOnce(new Promise((resolve) => { finishEncryption = resolve; }));
		const { prepareSecureStorage } = await import("./secureStorage");
		const first = prepareSecureStorage(), second = prepareSecureStorage();
		expect(second).toBe(first);
		await vi.waitFor(() => expect(state.encrypt).toHaveBeenCalledTimes(launch + 1));
		finishEncryption(Buffer.from("protected"));
		await Promise.all([first, second, prepareSecureStorage()]);
	}
	expect(state.show).not.toHaveBeenCalled();
	expect(state.available).toHaveBeenCalledTimes(2);
	expect(state.encrypt).toHaveBeenCalledTimes(2);
});
it("latches denied access even if Electron reports encryption available", async () => {
	state.encrypt.mockRejectedValueOnce(new Error("Keychain access denied"));
	const { prepareSecureStorage } = await import("./secureStorage");
	await expect(prepareSecureStorage()).rejects.toThrow("access denied");
	await expect(prepareSecureStorage()).rejects.toThrow("access denied");
	expect(state.encrypt).toHaveBeenCalledOnce();
});
it("does not encrypt when availability fails", async () => {
	state.available.mockResolvedValueOnce(false);
	const { prepareSecureStorage } = await import("./secureStorage");
	await expect(prepareSecureStorage()).rejects.toThrow("unavailable");
	expect(state.encrypt).not.toHaveBeenCalled();
});
it.each([
	["win32", true], ["linux", true], ["darwin", false],
])("skips secure storage preparation on %s (packaged: %s)", async (platform, packaged) => {
	vi.stubGlobal("process", { ...process, platform });
	state.packaged = packaged;
	const { prepareSecureStorage } = await import("./secureStorage");
	await prepareSecureStorage();
	expect(state.show).not.toHaveBeenCalled();
	expect(state.available).not.toHaveBeenCalled();
	expect(state.encrypt).not.toHaveBeenCalled();
});
