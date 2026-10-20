import { app, dialog, safeStorage } from "electron";

export class SecureStorageCancelledError extends Error {}

let preparation: Promise<void> | undefined;

/** Share the browser's async key provider on macOS; never retry a denied unlock automatically. */
export function prepareSecureStorage(): Promise<void> {
	return preparation ??= (async () => {
		if (process.platform !== "darwin" || !app.isPackaged) return;
		const { response } = await dialog.showMessageBox({
			type: "info",
			title: "Unlock Sweet Spot secure storage",
			message: "macOS may ask for your password next",
			detail: "Sweet Spot uses Keychain to protect your Google sign-in and paired integrations.\n\nIf macOS asks to access “Sweet Spot Safe Storage”, enter your Mac login keychain password in that system dialog. Choose “Always Allow” if you trust this installed app so macOS can remember your approval.\n\nSweet Spot never receives your password. Unlocking is shared for this app session; you do not need to enter a password for each integration.",
			buttons: ["Continue", "Quit"],
			defaultId: 0,
			cancelId: 1,
			noLink: true,
		});
		if (response !== 0) throw new SecureStorageCancelledError("Secure storage unlock cancelled");
		// Availability alone can be true even when no usable key was returned.
		// Encrypt a disposable value to verify access before opening browser sessions.
		if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error("Secure storage is unavailable");
		await safeStorage.encryptStringAsync("Sweet Spot secure storage check");
	})();
}
