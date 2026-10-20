import { beforeEach, describe, expect, it, vi } from "vitest";
import { initTRPC } from "@trpc/server";
const state = vi.hoisted(() => ({ listener: undefined as undefined | ((event: any, message: any) => void) }));
vi.mock("electron", () => ({ ipcMain: { on: (_channel: string, handler: typeof state.listener) => { state.listener = handler; } } }));
import { createIPCHandler } from "../../../../../vendor/electron-trpc/src/main/createIPCHandler";
const t = initTRPC.create();
const invoked = vi.fn(() => "ok");
const router = t.router({ check: t.procedure.query(invoked) });
const request = { method: "request", operation: { id: 1, type: "query", path: "check" } };
function event() {
	const frame = { routingId: 1 };
	return { senderFrame: frame, sender: { id: 1, mainFrame: frame, isDestroyed: () => false }, reply: vi.fn() };
}
beforeEach(() => { invoked.mockClear(); });
describe("forked IPC adapter", () => {
	it("rejects unauthorized and malformed messages before dispatch", async () => {
		createIPCHandler({ router, validateSender: () => false });
		state.listener!(event(), request);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(invoked).not.toHaveBeenCalled();
		createIPCHandler({ router, validateSender: () => true });
		for (const payload of [null, {}, { method: "request" }, { method: "other" }]) expect(() => state.listener!(event(), payload)).not.toThrow();
		expect(invoked).not.toHaveBeenCalled();
	});
	it("serves authorized requests and refuses subframes", async () => {
		createIPCHandler({ router, validateSender: () => true });
		const trusted = event(); state.listener!(trusted, request);
		await vi.waitFor(() => expect(trusted.reply).toHaveBeenCalledWith("electron-trpc", { id: 1, result: { type: "data", data: "ok" } }));
		expect(invoked).toHaveBeenCalledTimes(1);
		state.listener!({ ...event(), senderFrame: { routingId: 2 } }, request);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(invoked).toHaveBeenCalledTimes(1);
	});
});
