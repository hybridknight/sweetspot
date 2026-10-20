import type { AuthClientRecord } from "@main/auth/manager";
import { createEncryptedStore } from "@main/lib/store/createYmlStore";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

interface AuthStoreShape {
	clients: AuthClientRecord[];
}

let authStore: ReturnType<typeof createEncryptedStore<AuthStoreShape>> | undefined;
export function getAuthStore() {
	return authStore ??= createEncryptedStore<AuthStoreShape>("ytm-auth", { defaults: { clients: [] } });
}

export function readAuthClients(): AuthClientRecord[] {
	// An unused pairing feature needs neither a keychain key nor an empty store.
	if (!authStore && !existsSync(join(app.getPath("userData"), "ytm-auth.ytm"))) return [];
	const clients = getAuthStore().get("clients", []);
	return Array.isArray(clients) ? clients : [];
}

export function writeAuthClients(clients: AuthClientRecord[]): void {
	getAuthStore().set("clients", clients);
}
