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
		decryptString: (b: Buffer) => { if (!b.toString().startsWith("protected:")) throw new Error("OS decryption failed"); return b.toString().slice(10); },
	},
}));
import { createCacheEncryption, createEncryptedStore, createEncryption, getOrCreateEncryptionSecret } from "./createYmlStore";
import { safeStorage } from "electron";

function legacy(value: unknown, secret: string) {
	const iv = Buffer.from("0123456789abcdef");
	const cipher = createCipheriv("aes-256-cbc", createHash("sha256").update(secret).digest(), iv);
	const data = Buffer.concat([cipher.update(JSON.stringify({ message: value })), cipher.final()]).toString("base64url");
	const raw = `${data}.${iv.toString("base64")}`;
	return `${raw}.${createHash("sha256").update(raw).digest("base64")}`;
}
beforeEach(() => { state.directory = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-store-")); state.available = true; state.backend = "gnome_libsecret"; });
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
	it("migrates paired clients once and keeps the original as a restricted backup", () => {
		const name = "ytm-auth", secret = "legacy-profile-encryption-secret";
		const clients = [{ appId: "assistant", token: "old-opaque-bearer" }];
		fs.writeFileSync(path.join(state.directory, "ytm-auth.key"), legacy({ name, secret }, Buffer.from(name.padStart(32, "0")).toString("base64")));
		const old = legacy({ clients }, secret), filename = path.join(state.directory, "ytm-auth.ytm");
		fs.writeFileSync(filename, old);
		const store = createEncryptedStore(name, { defaults: { clients: [] as typeof clients } });
		expect(store.get("clients")).toEqual(clients);
		expect(fs.readFileSync(filename, "utf8")).toMatch(/^ssenc2\./);
		const backup = fs.readFileSync(`${filename}.legacy-backup`, "utf8");
		expect(backup).not.toBe(old);
		expect(createEncryption(name).decrypt(backup)).toEqual({ legacy: old });
		expect(fs.statSync(`${filename}.legacy-backup`).mode & 0o777).toBe(0o600);
		expect(createEncryptedStore(name).get("clients")).toEqual(clients);
		store.set("clients", []);
		expect(createEncryptedStore(name).get("clients")).toEqual([]);
		expect(fs.readFileSync(`${filename}.legacy-backup`, "utf8")).toBe(backup);
	});
	it("preserves corrupt stores instead of overwriting them with defaults", () => {
		const filename = path.join(state.directory, "ytm-auth.ytm"), corrupt = "ssenc2.bad.bad.bad";
		fs.writeFileSync(filename, corrupt);
		expect(() => createEncryptedStore("ytm-auth", { defaults: { clients: [] } })).toThrow("refusing to replace");
		expect(fs.readFileSync(filename, "utf8")).toBe(corrupt);
	});
	it("does not write keys when OS encryption is unavailable", () => {
		state.available = false;
		expect(() => getOrCreateEncryptionSecret("test")).toThrow("Secure storage is unavailable");
		expect(fs.readdirSync(state.directory)).toEqual([]);
	});
	it("refuses Linux plaintext fallback", () => {
		vi.stubGlobal("process", { ...process, platform: "linux" }); state.backend = "basic_text";
		expect(() => getOrCreateEncryptionSecret("test")).toThrow("Secure storage is unavailable");
		expect(fs.readdirSync(state.directory)).toEqual([]);
	});
	it("reuses protected keys and never replaces unreadable keys", () => {
		const key = getOrCreateEncryptionSecret("test"), filename = path.join(state.directory, "test.key.v2");
		expect(getOrCreateEncryptionSecret("test")).toBe(key);
		fs.writeFileSync(filename, "unreadable");
		expect(() => getOrCreateEncryptionSecret("test")).toThrow("OS decryption failed");
		expect(fs.readFileSync(filename, "utf8")).toBe("unreadable");
	});
});
