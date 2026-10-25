import type { App } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
	const logger = { debug: vi.fn(), error: vi.fn() };
	return {
		logger,
		settings: {
			instance: {
				api: { enabled: false, port: 13091 },
				mcp: { enabled: true, port: 13092, allowControl: false },
			},
			onSettingChange: vi.fn(() => ({ unsubscribe: vi.fn() })),
		},
		start: vi.fn(),
		destroy: vi.fn(async () => {}),
		createApi: vi.fn(),
		readClients: vi.fn(() => []),
	};
});
vi.mock("@main/core/baseProvider", () => ({
	BaseProvider: class {
		logger = mocks.logger;
		getProvider() {
			return mocks.settings;
		}
	},
}));
vi.mock("@main/mcp/server", () => ({ startMcpServer: mocks.start }));
vi.mock("@main/api/createApiWorker", () => ({ createApiWorker: mocks.createApi }));
vi.mock("@main/trpc/caller", () => ({ createMainCaller: () => ({ track: {}, navigation: {} }) }));
vi.mock("@main/auth", () => ({
	appAuth: { loadClients: vi.fn(), isValidToken: vi.fn() },
	readAuthClients: mocks.readClients,
}));
import ApiProvider from "./service";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.settings.instance.mcp = { enabled: true, port: 13092, allowControl: false };
	mocks.start.mockResolvedValue({ port: 13092, destroy: mocks.destroy });
});

describe("MCP listener lifecycle", () => {
	it("reports a storage failure without blaming the port or starting a listener", async () => {
		mocks.readClients.mockImplementationOnce(() => { throw new Error("OS decryption failed"); });
		const service = new ApiProvider({} as App);
		await service.restartMcp();
		expect(service.mcpStatus).toMatchObject({ running: false, error: expect.stringContaining("paired-client storage") });
		expect(mocks.start).not.toHaveBeenCalled();
		await service.restartMcp();
		expect(service.mcpStatus).toMatchObject({ running: true, error: null });
		await service.OnDestroy();
	});
	it("starts independently of the legacy API and closes on app teardown", async () => {
		const service = new ApiProvider({} as App);
		await service.restartMcp();
		expect(service.mcpStatus.running).toBe(true);
		expect(mocks.createApi).not.toHaveBeenCalled();
		await service.OnDestroy();
		expect(mocks.destroy).toHaveBeenCalledOnce();
		expect(service.mcpStatus.running).toBe(false);
	});
	it("serializes disabling against a slow listen and denies control immediately", async () => {
		let finish!: (value: unknown) => void;
		mocks.start.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		);
		const service = new ApiProvider({} as App);
		const starting = service.restartMcp();
		await vi.waitFor(() => expect(mocks.start).toHaveBeenCalledOnce());
		const options = mocks.start.mock.calls[0][0];
		mocks.settings.instance.mcp.enabled = false;
		const stopping = service.restartMcp();
		expect(options.isEnabled()).toBe(false);
		expect(options.canControl()).toBe(false);
		finish({ destroy: mocks.destroy });
		await Promise.all([starting, stopping]);
		expect(mocks.destroy).toHaveBeenCalledOnce();
		expect(service.mcpStatus.running).toBe(false);
		expect(mocks.start).toHaveBeenCalledOnce();
	});
	it("reports port conflicts and recovers when retried", async () => {
		mocks.start.mockRejectedValueOnce(Object.assign(new Error("Address in use"), { code: "EADDRINUSE" }));
		const service = new ApiProvider({} as App);
		await service.restartMcp();
		expect(service.mcpStatus).toMatchObject({
			running: false,
			error: expect.stringContaining("port is in use"),
		});
		await service.restartMcp();
		expect(service.mcpStatus).toMatchObject({ running: true, error: null });
		await service.OnDestroy();
	});
});
