import { platform } from "@electron-toolkit/utils";
import { AfterInit, BaseProvider, BeforeStart } from "@main/core/baseProvider";
import { isDevelopment, isProduction } from "@main/infra/devUtils";
import SettingsProvider from "@main/trpc/routers/settings/service";
import { App, powerSaveBlocker } from "electron";
import { basename } from "path";

const GTK_VERSION = /^[2-4]+$/.test(process.env.GTK_VERSION ?? "") ? process.env.GTK_VERSION : "3";

export default class StartupProvider extends BaseProvider implements AfterInit, BeforeStart {
	get settingsInstance(): SettingsProvider {
		return this.getProvider("settings");
	}
	get isEnabled() {
		return !!this.settingsInstance.instance?.app?.autostart;
	}
	get isInitialMinimized() {
		return !!this.settingsInstance.instance?.app?.autostartMinimized;
	}
	constructor(private app: App) {
		super("startup");
		if (platform.isWindows) {
			app.commandLine.appendSwitch("enable-gpu-rasterization"); // performance feature flags
			app.commandLine.appendSwitch("enable-zero-copy");
			app.commandLine.appendSwitch("force_high_performance_gpu"); // fixes choppy/lowfps video and transitions, defaults to primary gpu if no more powerful gpu is found
		}
		// Keep renderers (esp. YouTube WebContentsView) off Chromium background/EcoQoS throttling
		app.commandLine.appendSwitch("disable-renderer-backgrounding");
		app.commandLine.appendSwitch("disable-background-timer-throttling");
		app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
		if (isDevelopment) app.commandLine.appendSwitch("disable-web-security");
		// OS HiDPI / deviceScaleFactor (Retina, Windows 125%/150%). Do not force-device-scale-factor —
		// that freezes layout at 1× and breaks high-DPI. Page zoom for app chrome is locked separately.
		app.commandLine.appendSwitch("high-dpi-support", "1");
		if (platform.isLinux && GTK_VERSION) this.app.commandLine.appendSwitch("gtk-version", GTK_VERSION);
		if (platform.isLinux) this.app.commandLine.appendSwitch("ozone-platform-hint", "auto");
		// better gpu performance - for faster blur effect
		this.app.commandLine.appendSwitch("disable-gpu-sandbox");
		this.app.commandLine.appendSwitch(
			"enable-features",
			[
				"OverlayScrollbar",
				"FluentOverlayScrollbar",
				"CanvasOopRasterization",
				"SharedArrayBuffer",
				platform.isLinux && ["UseOzonePlatform", "WaylandWindowDecorations"],
				platform.isWindows && ["CanvasOopRasterization", "EnableDrDc"],
			]
				.flat()
				.filter(Boolean)
				.join(","),
		);
		this.app.commandLine.appendSwitch(
			"disable-features",
			[
				"CalculateNativeWinOcclusion",
				"IntensiveWakeUpThrottling",
				"UseEcoQoSForBackgroundProcess",
				"MediaSessionService", // xosms / OS media keys — keep out of Chromium MediaSession
				"HardwareMediaKeyHandling", // native media provider owns transport keys
			].join(","),
		);
	}
	async BeforeStart() {
		if (this.settingsInstance.instance.app.disableHardwareAccel) this.app.disableHardwareAcceleration();
		if (!platform.isMacOS) {
			powerSaveBlocker.start("prevent-app-suspension"); // app suspension on mac prevents sleep
		}
	}
	private get startArgs() {
		return ["--processStart", `"${basename(process.execPath)}"`, "--startup"];
	}
	get isStartupContext() {
		// macOS launches the bundle without the Windows-only login-item args.
		return process.argv.includes("--startup") || (platform.isMacOS && this.app.isPackaged && this.app.getLoginItemSettings().wasOpenedAtLogin);
	}
	get isMinimizedArg() {
		return !!process.argv.find((arg) => arg === "--minimized");
	}
	async AfterInit() {
		if (!platform.isMacOS && !platform.isWindows) return;
		if (!this.app.isPackaged) {
			// Older dev/preview runs could register the shared Electron.app bundle.
			// macOS reopens it without our app path, displaying Electron's welcome page.
			if (platform.isMacOS && this.app.getLoginItemSettings().openAtLogin) {
				this.app.setLoginItemSettings({ openAtLogin: false });
			}
			return;
		}
		if (!isProduction) return;
		this.settingsInstance.onSettingChange("app.autostart", (enabled) => this.syncLoginItem(enabled as boolean), {
			debounce: 1000,
		});
		this.syncLoginItem(this.isEnabled);
	}
	private syncLoginItem(enabled: boolean) {
		this.app.setLoginItemSettings(platform.isMacOS ? { openAtLogin: enabled } : {
			openAtLogin: enabled,
			path: process.execPath,
			args: this.startArgs,
		});
	}
}
