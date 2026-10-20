import { describe, expect, it, vi } from "vitest";
import { createMcpClientInput } from "@shared/mcp-client";

// Exercise real pairing validation without accessing the user's encrypted store.
vi.mock("./crypto", () => ({
	createAuthToken: (state: unknown) => JSON.stringify(state),
	parseAuthToken: (token: string) => JSON.parse(token),
}));
import { AppAuthManager } from "./manager";

describe("MCP setup client creation", () => {
	it("preserves migrated opaque bearers without trusting legacy token parsing", () => {
		const manager = new AppAuthManager();
		manager.loadClients([{ appId: "legacy", appName: "Existing client", appVersion: "1.0.0", createdAt: 1, token: "old.ciphertext.checksum" }]);
		expect(manager.isValidToken("old.ciphertext.checksum")).toBe(true);
		expect(manager.isValidToken("old.ciphertext.modified")).toBe(false);
		expect(manager.isValidToken("x".repeat(8193))).toBe(false);
		manager.revoke("legacy");
		expect(manager.isValidToken("old.ciphertext.checksum")).toBe(false);
	});
	it("creates a valid paired client using the setup form's metadata", () => {
		const manager = new AppAuthManager();
		const input = createMcpClientInput("  My AI assistant  ");
		const client = manager.createManual(input);
		expect(client).toMatchObject({ appId: input.appId, appName: "My AI assistant", appVersion: "1.0.0" });
		expect(manager.listClients()).toEqual([client]);
		expect(manager.isValidToken(client.token)).toBe(true);
		expect(manager.revoke(client.appId)).toBe(true);
		expect(manager.isValidToken(client.token)).toBe(false);
	});

	it("creates distinct clients without replacing another assistant's access", () => {
		const manager = new AppAuthManager();
		const first = manager.createManual(createMcpClientInput("My AI assistant"));
		const second = manager.createManual(createMcpClientInput("My AI assistant"));
		expect(first.appId).not.toBe(second.appId);
		expect(manager.listClients()).toHaveLength(2);
		expect(manager.isValidToken(first.token)).toBe(true);
		expect(manager.isValidToken(second.token)).toBe(true);
	});
});
