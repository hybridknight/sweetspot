import type { EventEmitter } from "node:events";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ create: vi.fn(), approve: vi.fn(), read: vi.fn(), write: vi.fn(), integrations: false, open: vi.fn() }));
vi.mock("@main/core/baseProvider", () => ({ BaseProvider: class {
	logger = { error: vi.fn() };
	getProvider() { return { instance: { mcp: { enabled: state.integrations }, api: { enabled: false } } }; }
} }));
vi.mock("@main/auth", async () => {
	const { EventEmitter } = await import("node:events");
	const manager = new EventEmitter() as EventEmitter & Record<string, any>;
	manager.createManual = state.create; manager.approve = state.approve;
	manager.loadClients = (clients: unknown[]) => manager.emit("loaded", clients);
	manager.listClients = () => [];
	return { getAuthStore: state.open, readAuthClients: state.read, writeAuthClients: state.write, appAuth: manager };
});
import { appAuth } from "@main/auth";
import AuthProvider from "./service";
beforeEach(() => {
	appAuth.removeAllListeners(); vi.clearAllMocks(); state.integrations = false; state.read.mockReturnValue([]);
});
it("does not unlock pairing storage on ordinary startup", async () => {
	const provider = new AuthProvider({} as Electron.App);
	await provider.AfterInit();
	expect(state.read).not.toHaveBeenCalled();
	expect(state.write).not.toHaveBeenCalled();
	expect(await provider.getClients()).toEqual([]);
	expect(state.read).toHaveBeenCalledTimes(1);
	expect(state.write).not.toHaveBeenCalled();
});
it("loads stored clients automatically when integrations need authentication", async () => {
	state.integrations = true;
	await new AuthProvider({} as Electron.App).AfterInit();
	expect(state.read).toHaveBeenCalledTimes(1);
	expect(state.write).not.toHaveBeenCalled();
});
it("keeps playing but refuses pairing mutations if storage cannot be loaded", async () => {
	state.read.mockImplementation(() => { throw new Error("store unreadable"); });
	const provider = new AuthProvider({} as Electron.App);
	await expect(provider.AfterInit()).resolves.toBeUndefined();
	await expect(provider.createManualClient({ appId: "test", appName: "Test" })).rejects.toThrow("storage is unavailable");
	await expect(provider.approveAuth("request")).rejects.toThrow("storage is unavailable");
	expect(state.create).not.toHaveBeenCalled(); expect(state.approve).not.toHaveBeenCalled();
});

it("shares a pending read across simultaneous callers", async () => {
	let finish!: (clients: unknown[]) => void;
	state.read.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
	const provider = new AuthProvider({} as Electron.App);
	await provider.AfterInit();
	const first = provider.getClients(), second = provider.getClients();
	expect(state.read).toHaveBeenCalledOnce();
	finish([]);
	await expect(first).resolves.toEqual([]);
	await expect(second).resolves.toEqual([]);
});
it("opens persistence before issuing a token and refuses writes if opening fails", async () => {
	state.open.mockRejectedValueOnce(new Error("Keychain access denied"));
	const provider = new AuthProvider({} as Electron.App);
	await provider.AfterInit();
	await expect(provider.createManualClient({ appId: "test", appName: "Test" })).rejects.toThrow("storage is unavailable");
	expect(state.create).not.toHaveBeenCalled();
	expect(state.write).not.toHaveBeenCalled();
});

it("does not rewrite snapshots loaded again by API or MCP", async () => {
	state.integrations = true;
	const provider = new AuthProvider({} as Electron.App);
	await provider.AfterInit();
	appAuth.loadClients([]);
	expect(state.write).not.toHaveBeenCalled();
});
