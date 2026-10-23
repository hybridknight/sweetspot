import { app, safeStorage } from "electron";

let preparation: Promise<void> | undefined;

/** Share the browser's async key provider on macOS; never retry a denied unlock automatically. */
export function prepareSecureStorage(): Promise<void> {
	return preparation ??= (async () => {
		if (process.platform !== "darwin" || !app.isPackaged) return;
		// Let macOS request permission only when needed; an app-owned preflight
		// dialog cannot tell whether Keychain access was already approved.
		// Availability alone can be true even when no usable key was returned.
		// Encrypt a disposable value to verify access before opening browser sessions.
		if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure storage is unavailable");
		await safeStorage.encryptStringAsync("Sweet Spot secure storage check");
	})();
}
