import { describe, expect, it } from "vitest";
import { CHROMECAST_MAX_RECEIVERS, findReceiverById, normalizeReceiverId, sanitizeReceiverList } from "./receivers";

describe("sanitizeReceiverList", () => {
	it("drops invalid ids and caps length", () => {
		const input = [
			{ id: "abc", name: "Living room" },
			{ id: "abc", name: "dup" },
			{ id: "<script>", name: "bad" },
			{ id: "ok-2", name: "Kitchen\nTV" },
			null,
			{ id: 1, name: "nope" },
		];
		expect(sanitizeReceiverList(input)).toEqual([
			{ id: "abc", name: "Living room" },
			{ id: "ok-2", name: "KitchenTV" },
		]);
	});

	it("caps receiver count", () => {
		const input = Array.from({ length: CHROMECAST_MAX_RECEIVERS + 5 }, (_, i) => ({
			id: `dev-${i}`,
			name: `Device ${i}`,
		}));
		expect(sanitizeReceiverList(input)).toHaveLength(CHROMECAST_MAX_RECEIVERS);
	});

	it("returns empty for non-arrays", () => {
		expect(sanitizeReceiverList(null)).toEqual([]);
		expect(sanitizeReceiverList({})).toEqual([]);
	});
});

describe("findReceiverById", () => {
	const list = [{ id: "a1", name: "A" }];
	it("maps selected id", () => {
		expect(findReceiverById(list, "a1")?.name).toBe("A");
	});
	it("rejects missing or forged ids", () => {
		expect(findReceiverById(list, "nope")).toBeNull();
		expect(findReceiverById(list, "../x")).toBeNull();
		expect(findReceiverById(list, null)).toBeNull();
	});
});

describe("normalizeReceiverId", () => {
	it("keeps hex cast ids", () => {
		expect(normalizeReceiverId("a1b2c3d4e5f67890")).toBe("a1b2c3d4e5f67890");
	});
	it("slugs shield-style fqdn with spaces", () => {
		expect(normalizeReceiverId("SHIELD Android TV._googlecast._tcp.local")).toBe("SHIELD-Android-TV._googlecast._tcp.local");
	});
	it("decodes txt buffers", () => {
		expect(normalizeReceiverId(new TextEncoder().encode("nid123"))).toBe("nid123");
	});
	it("rejects empty", () => {
		expect(normalizeReceiverId("")).toBeNull();
		expect(normalizeReceiverId("!!!")).toBeNull();
	});
});
