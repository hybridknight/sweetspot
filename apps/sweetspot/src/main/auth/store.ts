import type { AuthClientRecord } from "@main/auth/manager";
import { createEncryptedStore } from "@main/lib/store/createYmlStore";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

interface AuthStoreShape {
	clients: AuthClientRecord[];
}

let authStore: Awaited<ReturnType<typeof createEncryptedStore<AuthStoreShape>>> | undefined;
let opening: Promise<NonNullable<typeof authStore>> | undefined;
export function getAuthStore() {
	return opening ??= createEncryptedStore<AuthStoreShape>("ytm-auth", { defaults: { clients: [] } }).then((store) => authStore = store);
}

export async function readAuthClients(): Promise<AuthClientRecord[]> {
	// An unused pairing feature needs neither a keychain key nor an empty store.
	if (!authStore && !existsSync(join(app.getPath("userData"), "ytm-auth.ytm"))) return [];
	const clients = (await getAuthStore()).get("clients", []);
	return Array.isArray(clients) ? clients : [];
}

export function writeAuthClients(clients: AuthClientRecord[]): void {
	// Mutations prepare the store before changing the manager, so persistence stays synchronous.
	if (!authStore) throw new Error("Paired-client storage is not initialized yet.");
	authStore.set("clients", clients);
}
