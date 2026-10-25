import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCipheriv, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ directory: "", available: true, backend: "gnome_libsecret" }));
vi.mock("electron", () => ({
	app: { getPath: () => state.directory },
	safeStorage: {
		isEncryptionAvailable: () => state.available,
		getSelectedStorageBackend: () => state.backend,
		encryptString: (s: string) => Buffer.from(`protected:${s}`),
		encryptStringAsync: vi.fn(async (s: string) => Buffer.from(`protected:${s}`)),
		decryptStringAsync: vi.fn(async (b: Buffer) => ({ result: b.toString().slice(10), shouldReEncrypt: false })),
		decryptString: (b: Buffer) => { if (!b.toString().startsWith("protected:")) throw new Error("OS decryption failed"); return b.toString().slice(10); },
	},
}));
vi.mock("@main/infra/secureStorage", () => ({ prepareSecureStorage: async () => {} }));
import { createCacheEncryption, createEncryptedStore, createEncryption, getOrCreateEncryptionSecret } from "./createYmlStore";
import { safeStorage } from "electron";
import { AuthenticatedEncryption } from "./encryption";

function legacy(value: unknown, secret: string) {
	const iv = Buffer.from("0123456789abcdef");
	const cipher = createCipheriv("aes-256-cbc", createHash("sha256").update(secret).digest(), iv);
	const data = Buffer.concat([cipher.update(JSON.stringify({ message: value })), cipher.final()]).toString("base64url");
	const raw = `${data}.${iv.toString("base64")}`;
	return `${raw}.${createHash("sha256").update(raw).digest("base64")}`;
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("process", { ...process, platform: "linux" }); state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-store-")); state.available = true; state.backend = "gnome_libsecret"; });
afterEach(() => { fs.rmSync(state.directory, { force: true, recursive: true }); vi.unstubAllGlobals(); });

describe("OS protected stores", () => {
	it("keeps disposable cache keys in memory without opening secure storage", () => {
		const check = vi.spyOn(safeStorage, "isEncryptionAvailable");
		const encrypt = vi.spyOn(safeStorage, "encryptString");
		const first = createCacheEncryption("popup-regression");
		const raw = first.encrypt({ thumbnail: "test" });
		expect(createCacheEncryption("popup-regression").decrypt(raw)).toEqual({ thumbnail: "test" });
		expect(createCacheEncryption("another-cache").decrypt(raw)).toBeNull();
		expect(check).not.toHaveBeenCalled();
		expect(encrypt).not.toHaveBeenCalled();
		expect(fs.readdirSync(state.directory)).toEqual([]);
		vi.restoreAllMocks();
	});
	it("shares concurrent macOS key loads and avoids the separate synchronous provider", async () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const syncCheck = vi.spyOn(safeStorage, "isEncryptionAvailable");
		const syncEncrypt = vi.spyOn(safeStorage, "encryptString");
		const encrypt = vi.spyOn(safeStorage, "encryptStringAsync");
		const keys = await Promise.all([getOrCreateEncryptionSecret("mac"), getOrCreateEncryptionSecret("mac")]);
		expect(keys[0]).toBe(keys[1]);
		expect(encrypt).toHaveBeenCalledTimes(1);
		expect(syncCheck).not.toHaveBeenCalled();
		expect(syncEncrypt).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	});
	it("does not retry a failed macOS unlock across repeated requests", async () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const encrypt = vi.spyOn(safeStorage, "encryptStringAsync").mockRejectedValueOnce(new Error("Access denied"));
		await expect(getOrCreateEncryptionSecret("denied")).rejects.toThrow("Access denied");
		await expect(getOrCreateEncryptionSecret("denied")).rejects.toThrow("Access denied");
		expect(encrypt).toHaveBeenCalledTimes(1);
		expect(fs.readdirSync(state.directory)).toEqual([]);
		vi.restoreAllMocks();
	});
	it("opens existing release clients with their original macOS key provider when async decryption fails", async () => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const secret = Buffer.alloc(32, 7).toString("base64");
		const key = Buffer.from(`v10${secret}`), keyPath = path.join(state.directory, "ytm-auth.key.v2");
		const clients = [{ appId: "assistant", token: "existing-client-token" }];
		const raw = new AuthenticatedEncryption(secret).encrypt({ clients });
		fs.writeFileSync(keyPath, key);
		fs.writeFileSync(path.join(state.directory, "ytm-auth.ytm"), raw);
		vi.spyOn(safeStorage, "decryptStringAsync").mockRejectedValueOnce(new Error("Async provider cannot decrypt legacy key"));
		const sync = vi.spyOn(safeStorage, "decryptString").mockReturnValueOnce(secret);
		const store = await createEncryptedStore("ytm-auth", { defaults: { clients: [] as typeof clients } });
		expect(store.get("clients")).toEqual(clients);
		expect(sync).toHaveBeenCalledExactlyOnceWith(key);
		expect(fs.readFileSync(keyPath)).toEqual(key);
		expect(fs.readFileSync(path.join(state.directory, "ytm-auth.ytm"), "utf8")).toBe(raw);
		vi.restoreAllMocks();
	});
	it.each(["v10", "v11"])("preserves unreadable macOS %s keys and does not retry providers on repeated requests", async (prefix) => {
		vi.stubGlobal("process", { ...process, platform: "darwin" });
		const key = Buffer.from(`${prefix}unreadable`), filename = path.join(state.directory, "broken.key.v2");
		fs.writeFileSync(filename, key);
		const asyncDecrypt = vi.spyOn(safeStorage, "decryptStringAsync").mockRejectedValueOnce(new Error("Async decryption failed"));
		const sync = vi.spyOn(safeStorage, "decryptString").mockImplementationOnce(() => { throw new Error("Sync decryption failed"); });
		await expect(getOrCreateEncryptionSecret("broken")).rejects.toThrow("Async decryption failed");
		await expect(getOrCreateEncryptionSecret("broken")).rejects.toThrow("Async decryption failed");
		expect(asyncDecrypt).toHaveBeenCalledTimes(1);
		expect(sync).toHaveBeenCalledTimes(prefix === "v10" ? 1 : 0);
		expect(fs.readFileSync(filename)).toEqual(key);
		vi.restoreAllMocks();
	});
	it("migrates paired clients once and keeps the original as a restricted backup", async () => {
		const name = "ytm-auth", secret = "legacy-profile-encryption-secret";
		const clients = [{ appId: "assistant", token: "old-opaque-bearer" }];
		fs.writeFileSync(path.join(state.directory, "ytm-auth.key"), legacy({ name, secret }, Buffer.from(name.padStart(32, "0")).toString("base64")));
		const old = legacy({ clients }, secret), filename = path.join(state.directory, "ytm-auth.ytm");
		fs.writeFileSync(filename, old);
		const store = await createEncryptedStore(name, { defaults: { clients: [] as typeof clients } });
		expect(store.get("clients")).toEqual(clients);
		expect(fs.readFileSync(filename, "utf8")).toMatch(/^ssenc2\./);
		const backup = fs.readFileSync(`${filename}.legacy-backup`, "utf8");
		expect(backup).not.toBe(old);
		expect((await createEncryption(name)).decrypt(backup)).toEqual({ legacy: old });
		expect(fs.statSync(`${filename}.legacy-backup`).mode & 0o777).toBe(0o600);
		expect((await createEncryptedStore(name)).get("clients")).toEqual(clients);
		store.set("clients", []);
		expect((await createEncryptedStore(name)).get("clients")).toEqual([]);
		expect(fs.readFileSync(`${filename}.legacy-backup`, "utf8")).toBe(backup);
	});
	it("preserves corrupt stores instead of overwriting them with defaults", async () => {
		const filename = path.join(state.directory, "ytm-auth.ytm"), corrupt = "ssenc2.bad.bad.bad";
		fs.writeFileSync(filename, corrupt);
		await expect(createEncryptedStore("ytm-auth", { defaults: { clients: [] } })).rejects.toThrow("refusing to replace");
		expect(fs.readFileSync(filename, "utf8")).toBe(corrupt);
	});
	it("does not write keys when OS encryption is unavailable", async () => {
		state.available = false;
		await expect(getOrCreateEncryptionSecret("test")).rejects.toThrow("Secure storage is unavailable");
		expect(fs.readdirSync(state.directory)).toEqual([]);
	});
	it("refuses Linux plaintext fallback", async () => {
		vi.stubGlobal("process", { ...process, platform: "linux" }); state.backend = "basic_text";
		await expect(getOrCreateEncryptionSecret("test")).rejects.toThrow("Secure storage is unavailable");
		expect(fs.readdirSync(state.directory)).toEqual([]);
	});
	it("reuses protected keys and never replaces unreadable keys", async () => {
		const key = await getOrCreateEncryptionSecret("test"), filename = path.join(state.directory, "test.key.v2");
		expect(await getOrCreateEncryptionSecret("test")).toBe(key);
		fs.writeFileSync(filename, "unreadable");
		// Successful keys stay in memory until restart; an unreadable different key is preserved.
		expect(await getOrCreateEncryptionSecret("test")).toBe(key);
		const unreadable = path.join(state.directory, "broken.key.v2");
		fs.writeFileSync(unreadable, "unreadable");
		await expect(getOrCreateEncryptionSecret("broken")).rejects.toThrow("OS decryption failed");
		expect(fs.readFileSync(filename, "utf8")).toBe("unreadable");
	});
});
