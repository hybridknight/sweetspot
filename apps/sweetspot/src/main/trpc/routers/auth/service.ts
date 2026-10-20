import { type AuthClientRecord, appAuth, type PendingAuthRequest, getAuthStore, readAuthClients, writeAuthClients } from "@main/auth";
import { AfterInit, BaseProvider } from "@main/core/baseProvider";
import { type App } from "electron";
import { Subject } from "rxjs";

/**
 * Global auth provider — owns pairing UX + encrypted client persistence.
 * API / Remote gate on `appAuth.isValidToken`.
 */
export default class AuthProvider extends BaseProvider implements AfterInit {
	private _bound = false;
	private storageReady = false;
	private loading: Promise<void> | undefined;
	private async requireStorage(forWrite = false) {
		if (!this._bound) throw new Error("Paired-client storage is not initialized yet.");
		try {
			await (this.loading ??= (async () => {
				appAuth.loadClients(await readAuthClients());
				this.storageReady = true;
			})());
			if (forWrite) await getAuthStore();
		} catch (cause) {
			throw new Error("Paired-client storage is unavailable. Unlock your OS keychain or restore a valid store, then restart Sweet Spot.", { cause });
		}
	}

	readonly pendingAuth$ = new Subject<PendingAuthRequest | null>();
	readonly clients$ = new Subject<AuthClientRecord[]>();

	constructor(private _app: App) {
		super("auth");
	}

	async AfterInit() {
		if (this._bound) return;
		this._bound = true;

		appAuth.on("pending", (pending: PendingAuthRequest) => {
			this.pendingAuth$.next(pending);
			void (async () => {
				const win = await this.getProvider("app").openSettingsWindow();
				if (win && !win.isDestroyed()) {
					const { loadUrlOfWindow } = await import("@main/windows/webContentUtils");
					await loadUrlOfWindow(win, "/api-integrations/authentication");
				}
			})();
		});
		appAuth.on("resolved", () => {
			this.pendingAuth$.next(appAuth.listPending()[0] ?? null);
		});
		// API and MCP also load snapshots; reads must never create or rewrite a store.
		appAuth.on("loaded", (next: AuthClientRecord[]) => this.clients$.next(next));
		appAuth.on("clients", (next: AuthClientRecord[]) => {
			if (this.storageReady) writeAuthClients(next);
			this.clients$.next(next);
		});
		const settings = this.getProvider("settings").instance;
		if (settings.mcp?.enabled || (settings.api?.enabled && settings.api?.authRequired)) {
			try { await this.requireStorage(); }
			catch (error) { this.logger.error("Paired clients unavailable", error); }
		}
	}

	get app() {
		return this._app;
	}

	getPendingAuth(): PendingAuthRequest[] {
		return appAuth.listPending();
	}

	async getClients(): Promise<AuthClientRecord[]> {
		await this.requireStorage();
		return appAuth.listClients();
	}

	async approveAuth(id: string): Promise<AuthClientRecord | null> {
		await this.requireStorage(true);
		return appAuth.approve(id);
	}

	denyAuth(id: string): boolean {
		return appAuth.deny(id);
	}

	async revokeClient(appId: string): Promise<boolean> {
		await this.requireStorage(true);
		return appAuth.revoke(appId);
	}

	async revokeAllClients() {
		await this.requireStorage(true);
		appAuth.revokeAll();
	}

	async createManualClient(input: { appId: string; appName: string; appVersion?: string }): Promise<AuthClientRecord> {
		await this.requireStorage(true);
		return appAuth.createManual(input);
	}

	async getClientToken(appId: string): Promise<string | null> {
		await this.requireStorage();
		return appAuth.getClientToken(appId);
	}
}
