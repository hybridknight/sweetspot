import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMcpApp, createPlayerMcpServer, type PlayerActions, startMcpServer } from "./server";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
	for (const close of cleanup.splice(0).reverse()) await close();
});
function actions(): PlayerActions {
	return {
		current: vi.fn(async () => ({ title: "Test song" })),
		state: vi.fn(async () => ({ isPlaying: true })),
		queueList: vi.fn(async () => [{ videoId: "abcdefghijk" }]),
		play: vi.fn(async () => ({ isPlaying: true })),
		pause: vi.fn(async () => ({ isPlaying: false })),
		next: vi.fn(async () => ({ ok: true })),
		prev: vi.fn(async () => ({ ok: true })),
		volume: vi.fn(async (input) => input),
		seek: vi.fn(async (input) => input),
		watch: vi.fn(async (input) => input),
		queue: vi.fn(async (input) => input),
	};
}
async function connect(canControl = () => false, player = actions()) {
	const server = createPlayerMcpServer(player, canControl);
	const client = new Client({ name: "test", version: "1" });
	const [a, b] = InMemoryTransport.createLinkedPair();
	cleanup.push(
		() => server.close(),
		() => client.close(),
	);
	await server.connect(a);
	await client.connect(b);
	return { client, player };
}

describe("player MCP catalog", () => {
	it("defaults to read-only and exposes snapshots and a prompt", async () => {
		const { client, player } = await connect();
		expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["get_now_playing", "get_queue"]);
		expect(await client.callTool({ name: "get_now_playing" })).toMatchObject({
			content: [{ text: expect.stringContaining("Test song") }],
		});
		expect(await client.callTool({ name: "get_queue" })).toMatchObject({
			content: [{ text: expect.stringContaining("abcdefghijk") }],
		});
		expect((await client.listResources()).resources).toHaveLength(2);
		expect(await client.readResource({ uri: "sweetspot://player/now-playing" })).toMatchObject({
			contents: [{ text: expect.stringContaining("Test song") }],
		});
		expect(await client.readResource({ uri: "sweetspot://player/queue" })).toMatchObject({
			contents: [{ text: expect.stringContaining("abcdefghijk") }],
		});
		expect((await client.listPrompts()).prompts[0].name).toBe("listening-assistant");
		expect((await client.getPrompt({ name: "listening-assistant" })).messages).toHaveLength(1);
		expect((await client.callTool({ name: "control_playback", arguments: { action: "play" } })).isError).toBe(true);
		expect(player.play).not.toHaveBeenCalled();
	});
	it("dispatches all authorized controls with absolute seek and percent volume", async () => {
		const { client, player } = await connect(() => true);
		expect((await client.listTools()).tools).toHaveLength(7);
		for (const action of ["play", "pause", "next", "previous"]) {
			expect((await client.callTool({ name: "control_playback", arguments: { action } })).isError).not.toBe(true);
		}
		expect(player.prev).toHaveBeenCalledOnce();
		await client.callTool({ name: "set_volume", arguments: { volume: 25 } });
		expect(player.volume).toHaveBeenCalledWith({ volume: 25 });
		await client.callTool({ name: "seek_to", arguments: { seconds: 45 } });
		expect(player.seek).toHaveBeenCalledWith({ time: 45000, type: "seek" });
		await client.callTool({ name: "play_song", arguments: { videoId: "abcdefghijk" } });
		expect(player.watch).toHaveBeenCalledWith({ videoId: "abcdefghijk" });
		await client.callTool({ name: "add_to_queue", arguments: { playlistId: "PLabc" } });
		expect(player.queue).toHaveBeenCalledWith({ playlistId: "PLabc" });
	});
	it("rejects invalid input without invoking the player", async () => {
		const { client, player } = await connect(() => true);
		for (const [name, args] of [
			["set_volume", { volume: 101 }],
			["set_volume", { volume: -1 }],
			["set_volume", { volume: "25" }],
			["seek_to", { seconds: -1 }],
			["play_song", { videoId: "bad" }],
			["control_playback", { action: "execute" }],
			["add_to_queue", {}],
			["add_to_queue", { videoId: "abcdefghijk", playlistId: "PLabc" }],
		] as const)
			expect((await client.callTool({ name, arguments: args })).isError).toBe(true);
		expect(player.volume).not.toHaveBeenCalled();
		expect(player.seek).not.toHaveBeenCalled();
		expect(player.watch).not.toHaveBeenCalled();
		expect(player.queue).not.toHaveBeenCalled();
	});
	it("checks permission again at execution and reports player failures", async () => {
		let allowed = true;
		const { client, player } = await connect(() => allowed);
		allowed = false;
		expect((await client.callTool({ name: "control_playback", arguments: { action: "play" } })).isError).toBe(true);
		expect(player.play).not.toHaveBeenCalled();
		vi.mocked(player.current).mockRejectedValue(new Error("YouTube Music is not ready"));
		expect(await client.callTool({ name: "get_now_playing" })).toMatchObject({
			isError: true,
			content: [{ text: "YouTube Music is not ready" }],
		});
	});
});

describe("local MCP HTTP boundary", () => {
	it("connects using the official client and enforces live token revocation", async () => {
		let validToken = "secret";
		const handle = await startMcpServer({
			port: 0,
			actions: actions(),
			canControl: () => true,
			isEnabled: () => true,
			isAuthorized: (token) => token === validToken,
		});
		cleanup.push(() => handle.destroy());
		const url = new URL(`http://127.0.0.1:${handle.port}/mcp`);
		const client = new Client({ name: "http-test", version: "1" });
		cleanup.push(() => client.close());
		await client.connect(
			new StreamableHTTPClientTransport(url, {
				requestInit: { headers: { Authorization: "Bearer secret" } },
			}),
		);
		expect((await client.listTools()).tools).toHaveLength(7);
		expect(await client.callTool({ name: "get_now_playing" })).toMatchObject({
			content: [{ text: expect.stringContaining("Test song") }],
		});
		validToken = "revoked";
		expect((await fetch(url, { headers: { Authorization: "Bearer secret" } })).status).toBe(401);
	});
	it("rejects untrusted hosts, origins, absent tokens, disabled access, and oversized bodies", async () => {
		let enabled = true;
		const app = createMcpApp({
			actions: actions(),
			canControl: () => false,
			isEnabled: () => enabled,
			isAuthorized: (token) => token === "secret",
		});
		const headers = { host: "127.0.0.1:13092", authorization: "Bearer secret" };
		const request = (overrides: Record<string, string> = {}, method = "GET", body?: string) =>
			app.request("http://127.0.0.1:13092/mcp", {
				method,
				headers: { ...headers, ...overrides },
				body,
			});
		expect((await request({ host: "evil.example" })).status).toBe(403);
		expect((await request({ origin: "https://evil.example" })).status).toBe(403);
		expect((await request({ origin: "null" })).status).toBe(403);
		expect((await request({ authorization: "" })).status).toBe(401);
		expect((await request({ authorization: "secret" })).status).toBe(401);
		expect((await request()).status).toBe(405);
		expect((await request({}, "DELETE")).status).toBe(405);
		expect((await request({ "content-type": "application/json" }, "POST", "x".repeat(65537))).status).toBe(413);
		expect((await request({ "content-type": "application/json", accept: "application/json, text/event-stream" }, "POST", "{bad")).status).toBe(400);
		enabled = false;
		expect((await request()).status).toBe(503);
	});
	it("releases the listening port on destroy", async () => {
		const options = {
			port: 0,
			actions: actions(),
			canControl: () => false,
			isEnabled: () => true,
			isAuthorized: () => true,
		};
		const first = await startMcpServer(options);
		await first.destroy();
		const second = await startMcpServer({ ...options, port: first.port });
		await second.destroy();
	});
});
