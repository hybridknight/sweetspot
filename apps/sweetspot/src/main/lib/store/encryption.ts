import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "ssenc2";

/** AES-GCM authenticates the ciphertext, purpose and envelope version. */
export class AuthenticatedEncryption {
	private readonly key: Buffer;
	constructor(secret: string) { this.key = createHash("sha256").update(secret).digest(); }

	encrypt(value: unknown, _expiresAt?: undefined, purpose = ""): string {
		const nonce = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.key, nonce);
		cipher.setAAD(Buffer.from(`${PREFIX}:${purpose}`));
		const encrypted = Buffer.concat([cipher.update(JSON.stringify({ value }), "utf8"), cipher.final()]);
		return [PREFIX, nonce.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
	}

	decrypt<T = unknown>(raw: string, purpose = ""): T | null {
		try {
			const parts = raw.split(".");
			if (parts.length !== 4 || parts[0] !== PREFIX) return null;
			const [, nonceText, dataText, tagText] = parts;
			if (![nonceText, dataText, tagText].every((s) => /^[A-Za-z0-9_-]+$/.test(s))) return null;
			const nonce = Buffer.from(nonceText, "base64url"), tag = Buffer.from(tagText, "base64url");
			if (nonce.length !== 12 || tag.length !== 16) return null;
			const decipher = createDecipheriv("aes-256-gcm", this.key, nonce);
			decipher.setAAD(Buffer.from(`${PREFIX}:${purpose}`));
			decipher.setAuthTag(tag);
			const json = Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
			return JSON.parse(json).value as T;
		} catch { return null; }
	}
}

/** Read-only compatibility for local migration. Never use for bearer verification. */
export function decryptLegacy<T>(raw: string, secret: string): T | null {
	try {
		const parts = raw.split(".");
		if (parts.length !== 3) return null;
		const [data, iv, checksum] = parts;
		if (createHash("sha256").update(`${data}.${iv}`).digest("base64") !== checksum) return null;
		const decipher = createDecipheriv("aes-256-cbc", createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64"));
		const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
		const envelope = JSON.parse(plain.toString("utf8"));
		if (envelope.purpose !== undefined || envelope.expiryDate !== undefined) return null;
		return envelope.message as T;
	} catch { return null; }
}
