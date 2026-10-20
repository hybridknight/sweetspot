import { isDevelopment } from "@main/infra/devUtils";
import type { IpcMainEvent } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Remote login/YouTube documents and subframes must never access the app router. */
export function isTrustedTrpcSender(event: Pick<IpcMainEvent, "sender" | "senderFrame">): boolean {
	try {
		if (!event.senderFrame || event.sender.isDestroyed() || event.senderFrame !== event.sender.mainFrame) return false;
		const url = new URL(event.senderFrame.url);
		if (isDevelopment && process.env.ELECTRON_RENDERER_URL) return url.origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
		url.hash = "";
		url.search = "";
		return ["index.html", "player.html"].some((file) => url.href === pathToFileURL(join(__dirname, "../renderer", file)).href);
	} catch { return false; }
}
