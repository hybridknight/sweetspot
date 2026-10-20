import { createCipheriv, createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuthenticatedEncryption, decryptLegacy } from "./encryption";

export function legacyFixture(value: unknown, secret: string): string {
	const iv = Buffer.from("0123456789abcdef");
	const cipher = createCipheriv("aes-256-cbc", createHash("sha256").update(secret).digest(), iv);
	const data = Buffer.concat([cipher.update(JSON.stringify({ message: value })), cipher.final()]).toString("base64url");
	const raw = `${data}.${iv.toString("base64")}`;
	return `${raw}.${createHash("sha256").update(raw).digest("base64")}`;
}

describe("authenticated storage encryption", () => {
	const enc = new AuthenticatedEncryption("a-test-secret-with-at-least-32-characters");
	it("round trips objects, false, zero and Unicode using unique nonces", () => {
		for (const value of [{ clients: [{ appName: "เพลง" }] }, false, 0, "", null]) {
			const first = enc.encrypt(value, undefined, "clients");
			expect(first).not.toBe(enc.encrypt(value, undefined, "clients"));
			expect(enc.decrypt(first, "clients")).toEqual(value);
		}
	});
	it("rejects wrong keys, purposes, malformed envelopes and changed ciphertext, nonce or tag", () => {
		const token = enc.encrypt({ appId: "assistant" }, undefined, "clients");
		expect(enc.decrypt(token, "other")).toBeNull();
		expect(new AuthenticatedEncryption("another-key").decrypt(token, "clients")).toBeNull();
		for (const index of [1, 2, 3]) {
			const pieces = token.split(".");
			const bytes = Buffer.from(pieces[index], "base64url"); bytes[0] ^= 1;
			pieces[index] = bytes.toString("base64url");
			expect(enc.decrypt(pieces.join("."), "clients")).toBeNull();
		}
		for (const raw of ["", "ssenc2.a.b.c", `${token}.extra`, legacyFixture({ a: 1 }, "legacy")]) expect(enc.decrypt(raw)).toBeNull();
	});
	it("decodes only the old local-store format for migration", () => {
		const value = { clients: [{ appId: "existing", token: "existing-bearer" }] };
		const fixture = legacyFixture(value, "legacy-secret");
		expect(decryptLegacy(fixture, "legacy-secret")).toEqual(value);
		expect(decryptLegacy(fixture, "wrong-secret")).toBeNull();
		expect(decryptLegacy(`${fixture}x`, "legacy-secret")).toBeNull();
	});
});
