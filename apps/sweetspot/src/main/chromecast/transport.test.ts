import { createRequire } from "node:module";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
const require = createRequire(import.meta.url);
const protocol = require("castv2/lib/proto.js");
const PacketStreamWrapper = require("castv2/lib/packet-stream-wrapper.js");

describe("vendored Cast transport", () => {
	it("loads the schema synchronously and round trips text and binary messages", () => {
		for (const payload of [{ payloadType: 0, payloadUtf8: JSON.stringify({ type: "PING" }) }, { payloadType: 1, payloadBinary: Buffer.from([1, 2, 3]) }]) {
			const message = { protocolVersion: 0, sourceId: "sender-0", destinationId: "receiver-0", namespace: "urn:x-cast:com.google.cast.tp.heartbeat", ...payload };
			const result = protocol.CastMessage.parse(protocol.CastMessage.serialize(message));
			expect(result.protocolVersion).toBe(0);
			expect(result.namespace).toBe(message.namespace);
			if (payload.payloadType === 0) expect(result.payloadUtf8).toBe(payload.payloadUtf8);
			else expect(Buffer.from(result.payloadBinary)).toEqual(payload.payloadBinary);
		}
	});
	it.each([0, 1024 * 1024 + 1, 0xffffffff])("closes streams advertising invalid packet size %s", async (length) => {
		const stream = new PassThrough();
		new PacketStreamWrapper(stream);
		const error = new Promise<Error>((resolve) => stream.once("error", resolve));
		const header = Buffer.alloc(4); header.writeUInt32BE(length); stream.write(header);
		expect((await error).message).toBe("Invalid Cast packet length");
		expect(stream.destroyed).toBe(true);
	});
	it("waits for complete packets across stream chunks", async () => {
		const stream = new PassThrough(), wrapper = new PacketStreamWrapper(stream);
		const packet = new Promise<Buffer>((resolve) => wrapper.once("packet", resolve));
		const header = Buffer.alloc(4); header.writeUInt32BE(3);
		stream.write(header.subarray(0, 2)); stream.write(header.subarray(2)); stream.write(Buffer.from([1])); stream.write(Buffer.from([2, 3]));
		expect(await packet).toEqual(Buffer.from([1, 2, 3])); stream.destroy();
	});
});
