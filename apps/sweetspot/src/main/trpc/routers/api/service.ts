import { ApiWorker, createApiWorker } from "@main/api/createApiWorker";
import { appAuth, readAuthClients } from "@main/auth";
import { AfterInit, BaseProvider, OnDestroy } from "@main/core/baseProvider";
import { type McpServerHandle, startMcpServer } from "@main/mcp/server";
import { createMainCaller } from "@main/trpc/caller";
import { API_ROUTES } from "@shared/constants/eventNames";
import { type App } from "electron";

export default class ApiProvider extends BaseProvider implements AfterInit, OnDestroy {
	private _thread?: ApiWorker;
	private _mcp?: McpServerHandle;
	private _mcpChain: Promise<void> = Promise.resolve();
	private _mcpError: string | null = null;
	private _destroyed = false;
	private _mcpSubscription?: { unsubscribe(): void };
	private _settingsBound = false;
	/** Serialize start/stop so disable cannot lose a race to an in-flight start. */
	private _lifecycleChain: Promise<void> = Promise.resolve();

	constructor(private _app: App) {
		super("api");
	}

	async AfterInit() {
		if (!this._settingsBound) {
			this._settingsBound = true;
			this.settingsProvider.onSettingChange(["api.enabled", "api.port", "api.authRequired"], (_value, _prev, key) => void this.__onApiSettingChange(key), { debounce: 200 });
		}

		this._mcpSubscription ??= this.settingsProvider.onSettingChange(["mcp.enabled", "mcp.port", "mcp.allowControl"], () => {
			void this.restartMcp();
		});
		await Promise.all([this.startOrStopFromSettings(), this.restartMcp()]);
	}

	get mcpStatus(): {
		enabled: boolean;
		port: number;
		allowControl: boolean;
		running: boolean;
		error: string | null;
	} {
		const config = this.settingsProvider.instance.mcp;
		return {
			enabled: config?.enabled === true,
			port: config?.port ?? 13092,
			allowControl: config?.allowControl === true,
			running: !!this._mcp,
			error: this._mcpError,
		};
	}

	restartMcp(): Promise<void> {
		this._mcpChain = this._mcpChain
			.catch(() => undefined)
			.then(async () => {
				await this._mcp?.destroy();
				this._mcp = undefined;
				this._mcpError = null;
				if (this._destroyed || !this.mcpStatus.enabled) return;
				try {
					const port = this.mcpStatus.port;
					if (!Number.isInteger(port) || port < 9999 || port > 39999) {
						this._mcpError = "Choose an MCP port between 9999 and 39999.";
						return;
					}
					try {
						appAuth.loadClients(await readAuthClients());
					} catch (error) {
						this.logger.error("MCP paired-client storage unavailable", error);
						this._mcpError = "Could not open paired-client storage. Unlock your OS keychain and restart Sweet Spot. Your saved clients have been preserved.";
						return;
					}
					const caller = createMainCaller();
					this._mcp = await startMcpServer({
						port,
						isEnabled: () => !this._destroyed && this.mcpStatus.enabled,
						canControl: () => !this._destroyed && this.mcpStatus.enabled && this.mcpStatus.allowControl,
						isAuthorized: (token) => appAuth.isValidToken(token),
						actions: {
							current: () => caller.track.current(),
							state: () => caller.track.state(),
							queueList: () => caller.navigation.queueList(),
							play: () => caller.track.play(),
							pause: () => caller.track.pause(),
							next: () => caller.track.next(),
							prev: () => caller.track.prev(),
							volume: (input) => caller.track.volume(input),
							seek: (input) => caller.track.seek(input),
							watch: (input) => caller.navigation.watch(input),
							queue: (input) => caller.navigation.queue(input),
						},
					});
				} catch (error) {
					this.logger.error("MCP server failed to start", error);
					this._mcpError =
						(error as NodeJS.ErrnoException).code === "EADDRINUSE"
							? "This port is in use. Choose another MCP port below."
							: "Could not start MCP. Try again or restart Sweet Spot.";
				}
			});
		return this._mcpChain;
	}

	async OnDestroy() {
		this._destroyed = true;
		this._mcpSubscription?.unsubscribe();
		await Promise.all([this._lifecycleChain, this._mcpChain]);
		await this.stopWorker();
		await this._mcp?.destroy();
		this._mcp = undefined;
	}

	get app() {
		return this._app;
	}

	get isInitialized() {
		return !!this._thread;
	}

	sendMessage(...args: any[]) {
		return this._thread?.invoke("socket", ...args);
	}

	private get settingsProvider() {
		return this.getProvider("settings");
	}

	private isApiEnabled(): boolean {
		return this.settingsProvider?.instance?.api?.enabled === true;
	}

	private async __onApiSettingChange(key: string) {
		if (key === "api.enabled" || key === "api.port" || key === "api.authRequired") {
			await this.startOrStopFromSettings();
		}
	}

	private startOrStopFromSettings(): Promise<void> {
		this._lifecycleChain = this._lifecycleChain.catch(() => undefined).then(() => this.runStartOrStop());
		return this._lifecycleChain;
	}

	private async runStartOrStop() {
		await this.stopWorker();

		if (this._destroyed || !this.isApiEnabled()) {
			this.logger.debug("API is disabled in settings");
			return;
		}

		const port = this.settingsProvider.instance.api.port;
		try {
			if (this.settingsProvider.instance.api.authRequired) appAuth.loadClients(await readAuthClients());
			const worker = await createApiWorker(this, this.windowContext.main);
			if (this._destroyed || !this.isApiEnabled()) {
				await worker.destroy();
				this.logger.debug("API disabled before listen — aborted start");
				return;
			}

			await worker.initialize(this.settingsProvider.instance);

			if (this._destroyed || !this.isApiEnabled()) {
				await worker.destroy();
				this.logger.debug("API disabled during listen — tore down");
				return;
			}

			this._thread = worker;
			this.logger.debug("API server initialized", { port });
		} catch (err) {
			this._thread = undefined;
			this.logger.error("API server failed to start", err);
		}
	}

	private async stopWorker() {
		if (!this._thread) return;
		const thread = this._thread;
		this._thread = undefined;
		await thread.destroy();
		this.logger.debug("API server stopped");
	}

	async getRoutes() {
		return Object.values(API_ROUTES).map((x) => x.replace(/^\/?api\//, ""));
	}
}
