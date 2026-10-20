import { createEncryption } from "@main/lib/store/createYmlStore";

/** Purpose salt — decrypt must use same purpose or returns null. */
export const AUTH_TOKEN_PURPOSE = "ytm.auth.client";

export interface AuthTokenState {
	appId: string;
	appName: string;
	appVersion: string;
	createdAt: number;
}

let _enc: ReturnType<typeof createEncryption> | null = null;

function authEncryption() {
	if (!_enc) _enc = createEncryption("app-auth-token");
	return _enc;
}

/** Encrypt client state into a single bearer token. */
export async function createAuthToken(state: AuthTokenState): Promise<string> {
	return (await authEncryption()).encrypt(state, undefined, AUTH_TOKEN_PURPOSE);
}

/** Decrypt bearer token → state, or null if tampered / wrong purpose. */
export async function parseAuthToken(token: string): Promise<AuthTokenState | null> {
	if (!token) return null;
	const state = (await authEncryption()).decrypt<AuthTokenState>(token, AUTH_TOKEN_PURPOSE);
	if (!state?.appId) return null;
	return state;
}
