import path from "node:path";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import slugify, { type SlugifyOptions } from "@shared/slug";
import { app, safeStorage } from "electron";
import { type ConfOptions as Options, Conf as Store } from "electron-conf/main";
import { parse as deserialize, stringify as serialize } from "yaml";
import { prepareSecureStorage } from "@main/infra/secureStorage";
import { AuthenticatedEncryption, decryptLegacy } from "./encryption";

const slugifyOptions: SlugifyOptions = { lower: true, replacement: "_", trim: true, remove: /[*+~.()'"!:@]/g };
const fileStem = (name: string) => path.join(app.getPath("userData"), slugify(name, slugifyOptions));

/** Refuse Linux's known-password fallback instead of persisting unprotected secrets. */
function requireKeyStorage(): void {
	if (!safeStorage.isEncryptionAvailable() || (process.platform === "linux" && safeStorage.getSelectedStorageBackend() === "basic_text")) {
		throw new Error("Secure storage is unavailable. Unlock your OS keychain or install a supported secret service before using paired clients.");
	}
}

const secrets = new Map<string, Promise<string>>();

export function getOrCreateEncryptionSecret(name: string): Promise<string> {
	const keyPath = `${fileStem(name)}.key.v2`;
	let pending = secrets.get(keyPath);
	if (!pending) {
		pending = loadEncryptionSecret(keyPath);
		// Cache both success and failure: simultaneous integrations must not re-prompt.
		secrets.set(keyPath, pending);
	}
	return pending;
}

async function loadEncryptionSecret(keyPath: string): Promise<string> {
	await prepareSecureStorage();
	const asyncMac = process.platform === "darwin";
	if (!asyncMac) requireKeyStorage();
	mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
	let secret: string;
	if (!existsSync(keyPath)) {
		secret = randomBytes(32).toString("base64");
		const encrypted = asyncMac ? await safeStorage.encryptStringAsync(secret) : safeStorage.encryptString(secret);
		writeFileSync(keyPath, encrypted, { mode: 0o600, flag: "wx" });
	} else {
		const encrypted = readFileSync(keyPath);
		secret = asyncMac ? await decryptMacSecret(encrypted) : safeStorage.decryptString(encrypted);
	}
	if (Buffer.from(secret, "base64").length !== 32) throw new Error("Invalid secure storage key");
	chmodSync(keyPath, 0o600);
	return secret;
}

async function decryptMacSecret(encrypted: Buffer): Promise<string> {
	try {
		return (await safeStorage.decryptStringAsync(encrypted)).result;
	} catch (cause) {
		// Releases before the async provider stored v10 keys with the synchronous
		// Keychain provider. Some installed profiles cannot open those keys through
		// the browser's async provider. Keep the original key intact and try its
		// original provider; never generate a replacement for an unreadable key.
		if (encrypted.subarray(0, 3).toString() !== "v10") throw cause;
		try {
			requireKeyStorage();
			return safeStorage.decryptString(encrypted);
		} catch {
			throw cause;
		}
	}
}

export async function createEncryption(name: string): Promise<AuthenticatedEncryption> {
	return new AuthenticatedEncryption(await getOrCreateEncryptionSecret(name));
}

const cacheEncryptors = new Map<string, AuthenticatedEncryption>();
/** Disposable caches must never open the OS keychain or trigger credential prompts. */
export function createCacheEncryption(name: string): AuthenticatedEncryption {
	let encryptor = cacheEncryptors.get(name);
	if (!encryptor) {
		encryptor = new AuthenticatedEncryption(randomBytes(32).toString("base64"));
		cacheEncryptors.set(name, encryptor);
	}
	return encryptor;
}

function readLegacySecret(name: string): string {
	const raw = readFileSync(`${fileStem(name)}.key`, "utf8");
	const secret = Buffer.from(name.padStart(32, "0")).toString("base64");
	const payload = decryptLegacy<{ name: string; secret: string }>(raw, secret);
	if (payload?.name !== name || typeof payload.secret !== "string" || payload.secret.length < 16) throw new Error("Invalid legacy storage key");
	return payload.secret;
}

export const createYmlStore = <T extends Record<string, any> = Record<string, any>>(name: string, options: Options<T> = {} as Options<T>) =>
	new Store<T>({ ext: ".yml", ...options, serializer: { read: deserialize, write: serialize }, name });

/** Construct after app.ready, when the OS keychain is available. */
export async function createEncryptedStore<T extends Record<string, any> = Record<string, any>>(name: string, options: Options<T> = {} as Options<T>) {
	const encryptor = await createEncryption(name);
	const filePath = path.join(options.dir ?? app.getPath("userData"), `${name}.ytm`);
	if (existsSync(filePath)) {
		const raw = readFileSync(filePath, "utf8");
		if (!raw.startsWith("ssenc2.")) {
			const data = decryptLegacy<T>(raw, readLegacySecret(name));
			if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Cannot migrate encrypted store ${name}; original file preserved`);
			const backup = `${filePath}.legacy-backup`;
			if (!existsSync(backup)) writeFileSync(backup, encryptor.encrypt({ legacy: raw }), { mode: 0o600, flag: "wx" });
			chmodSync(backup, 0o600);
			const temporary = `${filePath}.${randomBytes(8).toString("hex")}.tmp`;
			writeFileSync(temporary, encryptor.encrypt(data), { mode: 0o600, flag: "wx" });
			renameSync(temporary, filePath);
		}
	}
	const store = new Store<T>({
		ext: ".ytm", ...options, name,
		serializer: {
			read(raw) {
				const data = encryptor.decrypt<T>(raw);
				if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Cannot decrypt encrypted store ${name}; refusing to replace it with defaults`);
				return data;
			},
			write: (value) => encryptor.encrypt(value),
		},
	});
	if (existsSync(filePath)) chmodSync(filePath, 0o600);
	return store;
}
