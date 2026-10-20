import { type AuthClientRecord, appAuth, type PendingAuthRequest, readAuthClients, writeAuthClients } from "@main/auth";
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
	private requireStorage() {
		if (!this._bound) throw new Error("Paired-client storage is not initialized yet.");
		if (this.storageReady) return;
		try {
			appAuth.loadClients(readAuthClients());
			this.storageReady = true;
		} catch (cause) {
			throw new Error("Paired-client storage is unavailable. Unlock your OS keychain or restore a valid store, then try again.", { cause });
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
		appAuth.on("clients", (next: AuthClientRecord[]) => {
			// Loading a snapshot emits too; don't rewrite it or create an empty store.
			if (this.storageReady) writeAuthClients(next);
			this.clients$.next(next);
		});
		const settings = this.getProvider("settings").instance;
		if (settings.mcp?.enabled || (settings.api?.enabled && settings.api?.authRequired)) {
			try { this.requireStorage(); }
			catch (error) { this.logger.error("Paired clients unavailable", error); }
		}
	}

	get app() {
		return this._app;
	}

	getPendingAuth(): PendingAuthRequest[] {
		return appAuth.listPending();
	}

	getClients(): AuthClientRecord[] {
		this.requireStorage();
		return appAuth.listClients();
	}

	approveAuth(id: string): AuthClientRecord | null {
		this.requireStorage();
		return appAuth.approve(id);
	}

	denyAuth(id: string): boolean {
		return appAuth.deny(id);
	}

	revokeClient(appId: string): boolean {
		this.requireStorage();
		return appAuth.revoke(appId);
	}

	revokeAllClients() {
		this.requireStorage();
		appAuth.revokeAll();
	}

	createManualClient(input: { appId: string; appName: string; appVersion?: string }): AuthClientRecord {
		this.requireStorage();
		return appAuth.createManual(input);
	}

	getClientToken(appId: string): string | null {
		this.requireStorage();
		return appAuth.getClientToken(appId);
	}
}
