import { BaseProvider, OnDestroy, OnInit } from "@main/core/baseProvider";
import { createMainCaller } from "@main/trpc/caller";
import type SettingsProvider from "@main/trpc/routers/settings/service";
import { trackService } from "@main/trpc/routers/track";
import { App, globalShortcut } from "electron";

export default class ShortcutService extends BaseProvider implements OnInit, OnDestroy {
	get trackState() {
		return trackService.trackState;
	}
	private readonly shortcuts: ReadonlyArray<{ accelerator: string; action: () => Promise<unknown> }> = [
		{ accelerator: "Shift+Alt+Left", action: async () => await createMainCaller().track.prev() },
		{ accelerator: "Shift+Alt+Right", action: async () => await createMainCaller().track.next() },
		{ accelerator: "Shift+Alt+Space", action: async () => await createMainCaller().track.togglePlay() },
	];
	private registeredShortcuts = new Set<string>();
	private settingSubscription?: { unsubscribe(): void };

	private get settings(): SettingsProvider {
		return this.getProvider("settings");
	}

	constructor(private app: App) {
		super("shortcut");
	}

	async OnInit() {
		if (!this.app.isReady()) return;
		this.settingSubscription ??= this.settings.onSettingChange("player.globalShortcutsEnabled", (enabled) => {
			this.applyShortcuts(enabled === true);
		});
		this.applyShortcuts(this.settings.get("player.globalShortcutsEnabled", process.platform !== "darwin"));
	}

	private applyShortcuts(enabled: boolean) {
		if (!enabled) {
			this.unregisterShortcuts();
			return;
		}
		for (const { accelerator, action } of this.shortcuts) {
			if (this.registeredShortcuts.has(accelerator)) continue;
			const isRegistered = globalShortcut.register(accelerator, () => {
				void action().catch((error: unknown) => {
					this.logger.error(`failed to run shortcut action: ${accelerator}`, error);
				});
			});
			if (isRegistered) {
				this.registeredShortcuts.add(accelerator);
			} else {
				this.logger.warn(`failed to register shortcut: ${accelerator}`);
			}
		}
	}

	private unregisterShortcuts() {
		for (const accelerator of this.registeredShortcuts) {
			globalShortcut.unregister(accelerator);
		}
		this.registeredShortcuts.clear();
	}

	async OnDestroy() {
		this.settingSubscription?.unsubscribe();
		this.settingSubscription = undefined;
		this.unregisterShortcuts();
	}
}
