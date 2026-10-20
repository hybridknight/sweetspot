import { beforeEach, afterEach, expect, it, vi } from "vitest";

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
	state.show.mockResolvedValue({ response: 0 });
	state.available.mockResolvedValue(true);
	state.encrypt.mockResolvedValue(Buffer.from("protected"));
});
afterEach(() => vi.unstubAllGlobals());

it("explains Keychain access before touching it and shares one initialization", async () => {
	let continueDialog!: (value: { response: number }) => void;
	state.show.mockReturnValueOnce(new Promise((resolve) => { continueDialog = resolve; }));
	const { prepareSecureStorage } = await import("./secureStorage");
	const first = prepareSecureStorage(), second = prepareSecureStorage();
	expect(second).toBe(first);
	expect(state.show).toHaveBeenCalledOnce();
	expect(state.available).not.toHaveBeenCalled();
	expect(state.encrypt).not.toHaveBeenCalled();
	expect(state.show.mock.calls[0][0].detail).toContain("Always Allow");
	continueDialog({ response: 0 });
	await Promise.all([first, second, prepareSecureStorage()]);
	expect(state.available).toHaveBeenCalledOnce();
	expect(state.encrypt).toHaveBeenCalledOnce();
});
it("does not access Keychain or reopen instructions after cancellation", async () => {
	state.show.mockResolvedValueOnce({ response: 1 });
	const { prepareSecureStorage } = await import("./secureStorage");
	await expect(prepareSecureStorage()).rejects.toThrow("cancelled");
	await expect(prepareSecureStorage()).rejects.toThrow("cancelled");
	expect(state.show).toHaveBeenCalledOnce();
	expect(state.available).not.toHaveBeenCalled();
	expect(state.encrypt).not.toHaveBeenCalled();
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
it.each(["win32", "linux", "darwin"])("skips macOS instructions for development and other platforms (%s)", async (platform) => {
	vi.stubGlobal("process", { ...process, platform });
	state.packaged = false;
	const { prepareSecureStorage } = await import("./secureStorage");
	await prepareSecureStorage();
	expect(state.show).not.toHaveBeenCalled();
	expect(state.available).not.toHaveBeenCalled();
});
