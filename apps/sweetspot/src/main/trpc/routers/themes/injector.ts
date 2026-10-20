import { createLogger } from "@shared/utils/console";
import type { WebContents } from "electron";

export type CssSlot = "chrome" | "thumbnail" | "blur" | "theme";

const logger = createLogger("CssInjector");

/**
 * Single insertCSS / removeInsertedCSS store keyed by webContents id + slot.
 * Replaces dual CSSHandler + webContentUtils maps.
 */
export class CssInjector {
	private readonly keys = new Map<string, string>();

	constructor(private readonly webContents: WebContents) {}

	private slotKey(slot: CssSlot): string {
		return `${this.webContents.id}:${slot}`;
	}

	async inject(slot: CssSlot, css: string): Promise<boolean> {
		if (!css) return false;
		try {
			const oldKey = this.keys.get(this.slotKey(slot));
			const key = await this.webContents.insertCSS(css);
			this.keys.set(this.slotKey(slot), key);
			// Keep the previous stylesheet active until its replacement is installed.
			// Clearing first exposes the unthemed page during startup reapplication.
			if (oldKey) await this.webContents.removeInsertedCSS(oldKey).catch(() => undefined);
			return true;
		} catch (error: any) {
			logger.error(`Failed to inject [${slot}]: ${error?.message || "Unknown error"}`);
			return false;
		}
	}

	async clear(slot: CssSlot): Promise<boolean> {
		const mapKey = this.slotKey(slot);
		const cssKey = this.keys.get(mapKey);
		if (!cssKey) return false;
		try {
			await this.webContents.removeInsertedCSS(cssKey);
			return true;
		} catch {
			// Stale after document reload — ignore
			return false;
		} finally {
			this.keys.delete(mapKey);
		}
	}

	async clearAll(): Promise<void> {
		await Promise.all((["chrome", "thumbnail", "blur", "theme"] as CssSlot[]).map((slot) => this.clear(slot)));
	}

	has(slot: CssSlot): boolean {
		return this.keys.has(this.slotKey(slot));
	}
}
