import { THEME_PRESETS } from "@shared/themes/catalog";
import type ThemesProvider from "@main/trpc/routers/themes/service";
import { MusicLoadGate } from "./musicLoadGate";
import { SkinWindowSizes } from "@main/player/window-sizes";
import { resolveSkin } from "@shared/skins/builtins";
import type { SkinPackage } from "@shared/skins/schema";
import { configurePlayerMode, playerMode } from "@main/player/mode";
import { videoFullscreenPreferences } from "@main/player/video-preferences";
import { applyYoutubeZoom, bindYoutubeWebContents, TOOLBAR_HEIGHT } from "@main/domain/uiZoom";
import { getLifecycleContext } from "@main/lifecycle";
import { chromecastArgvFor, CHROMECAST_SETTING_KEY } from "@shared/chromecast/flag";
import { defaultUrl, isProduction } from "@main/infra/devUtils";
import { toChromeUserAgent } from "@main/infra/userAgent";
import { serverMain } from "@main/ipc/serverEvents";
import { logger } from "@shared/utils/console";
import translations from "@translations/index";
import { app, BrowserWindow, BrowserWindowConstructorOptions, WebContentsView } from "electron";
import { debounce } from "lodash-es";
import { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { createWindowContext } from "./mappedWindow";
import { createApiView, createView, googleLoginPopup } from "./view";
import { pushWindowStates } from "./webContentUtils";
import { bindWindowDisplayScale } from "./displayScale";
import { getBoundsWithScaleFactor, wrapWindowHandler } from "./windowUtils";
function isChromecastSettingEnabled(): boolean {
	try {
		const settings = getLifecycleContext().getProvider("settings") as { get?: (key: string, fallback?: boolean) => boolean };
		return !!settings?.get?.(CHROMECAST_SETTING_KEY, false);
	} catch {
		return false;
	}
}

export function isGoogleLoginUrl(url: URL): boolean {
	return /^accounts\.google\.(\w+)/.test(url.hostname);
}
export function isPreventedNavOrRedirect(url: URL): boolean {
	return (
		/^(?!consent\.youtube\.com|accounts\.youtube\.com|music\.youtube\.com|accounts\.google\.\w+)$/.test(url.hostname) &&
		!/^(www\.youtube\.com|youtube\.com)\/(premium|musicpremium)$/i.test(url.hostname + url.pathname) &&
		!url.hostname.match(/^accounts\.google\.(\w+)$/)
	);
}

const GOOGLE_LOGIN_URL =
	"https://accounts.google.com/ServiceLogin?" +
	new URLSearchParams({
		ltmpl: "music",
		service: "youtube",
		continue: "https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=https://music.youtube.com/",
	}).toString();
export interface WindowViews extends Record<string, WebContentsView> {
	youtubeView: WebContentsView;
	toolbarView: WebContentsView;
}

export class WindowManager {
	private mainWindow: BrowserWindow | null = null;
	private views: WindowViews | null = null;
	private loadingView: WebContentsView | null = null;
	private isGoogleLoginProcessing = false;
	private userAgentResolved: string | null = null;

	constructor(private readonly userAgent?: string) {}

	async createRootWindow(options?: BrowserWindowConstructorOptions) {
		const bounds = {
			width: 1500,
			height: 800,
		};
		this.mainWindow = new BrowserWindow({
			...bounds,
			minWidth: 800,
			minHeight: 480,
			autoHideMenuBar: true,
			icon: appIconPath,
			backgroundColor: "#030404",
      transparent: process.platform === "darwin",
      visualEffectState: "active",
			center: true,
			closable: true,
			skipTaskbar: false,
			resizable: true,
			frame: false,
			title: translations.appName,
			darkTheme: true,
			titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
			maximizable: true,
			show: false,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: true,
				sandbox: false,
				webSecurity: isProduction,
				allowRunningInsecureContent: !isProduction,
				backgroundThrottling: false,
				autoplayPolicy: "user-gesture-required",
				enableBlinkFeatures: "FluentScrollbars,FluentOverlayScrollbar,OverlayScrollbar",
				...(options?.webPreferences || {}),
			},
			...(options || {}),
		});

		this.setupWindowUserAgent();
		await this.setupViews();
		this.setupWindowEvents();
		await this.initializeWindowState(bounds);

		return createWindowContext({
			main: this.mainWindow,
			views: this.views!,
		});
	}

	private setupWindowUserAgent() {
		if (!this.mainWindow) return;

		const chromeUa = this.userAgent ?? toChromeUserAgent(this.mainWindow.webContents.getUserAgent());
		this.userAgentResolved = chromeUa;
		app.userAgentFallback = chromeUa;
		this.mainWindow.webContents.setUserAgent(chromeUa);
		logger.debug("chrome user-agent", chromeUa);
	}

	private applyChromeUserAgent(view: WebContentsView) {
		const chromeUa = this.userAgentResolved ?? this.userAgent ?? toChromeUserAgent(view.webContents.getUserAgent());
		this.userAgentResolved = chromeUa;
		view.webContents.setUserAgent(chromeUa);
	}

	private async setupViews() {
		if (!this.mainWindow) return;

		this.loadingView = await this.createLoadingView();
		this.views = {
			youtubeView: await this.createYoutubeView(),
			toolbarView: await this.createToolbarView(),
		};
    const settings = () => getLifecycleContext().getProvider("settings") as {
      get: (key: string) => unknown;
      set: (key: string, value: unknown) => unknown;
    };
    configurePlayerMode(this.mainWindow, this.views.youtubeView, this.views.toolbarView,
      () => this.updateViewBounds(), () => {
        const state = settings().get("playerSkins") as { selected?: string; custom?: SkinPackage[] } | undefined;
        const skin = resolveSkin(state?.selected ?? "", state?.custom ?? []);
        return { id: skin.id, width: skin.layout.width };
      }, new SkinWindowSizes({
        get: (key) => settings().get(key),
        set: (key, value) => settings().set(key, value),
      }));
		this.setupViewEvents();
	}

	private async createLoadingView() {
		const view = await createApiView("/youtube/loading", async (view) => {
			if (!this.mainWindow) return;

			const settings = getLifecycleContext().getProvider("settings") as { get: (key: string) => unknown };
			const enabled = settings.get("themes.enabled") !== false;
			const selected = settings.get("themes.selected");
			const palette = THEME_PRESETS.find((theme) => enabled && theme.id === selected) ?? THEME_PRESETS[0];
			view.setBackgroundColor(palette.background);
			await view.webContents.insertCSS(`:root { --music-loading-bg: ${palette.background}; --music-loading-surface: ${palette.surface}; --music-loading-block: ${palette.elevated}; --music-loading-text: ${palette.text}; --music-loading-muted: ${palette.muted}; }`);

			this.mainWindow.contentView.addChildView(view);

			const [width, height] = this.mainWindow.getSize();
			view.setBounds({
				x: 0,
				y: 0,
				width,
				height,
			});
		});
		return view;
	}

	private async createYoutubeView() {
		return await createView(
			join(__dirname, "../preload/youtube.js"),
			(view) => {
				if (!this.mainWindow) return;

				this.applyChromeUserAgent(view);
				this.mainWindow.contentView.addChildView(view);
				const [width, height] = this.mainWindow.getSize();
				view.setBounds({
					y: TOOLBAR_HEIGHT,
					x: 0,
					height: height - TOOLBAR_HEIGHT,
					width,
				});
				bindYoutubeWebContents(view.webContents);

				this.setupYoutubeViewEvents(view);
			},
			{
				...videoFullscreenPreferences,
				sandbox: false,
				contextIsolation: true,
				nodeIntegration: false,
				backgroundThrottling: false,
				additionalArguments: [chromecastArgvFor(isChromecastSettingEnabled())],
			},
		);
	}

	private async createToolbarView() {
		return await createApiView(
			"/youtube/toolbar",
			(view) => {
				if (!this.mainWindow) return;

				this.mainWindow.contentView.addChildView(view);
				this.mainWindow.contentView.addChildView(this.loadingView!);
				const [width] = this.mainWindow.getSize();
				view.setBounds({
					height: TOOLBAR_HEIGHT,
					width,
					x: 0,
					y: 0,
				});
			},
			{ lockSize: { resize: "width" }, transparent: true },
		);
	}

	private setupYoutubeViewEvents(view: WebContentsView) {
		let lastLocation: string;

		view.webContents.on("did-navigate", (ev, location) => {
			lastLocation = location;
		});
		// Prevent navigation if google is processing login
		view.webContents.on("will-navigate", (ev, location) => {
			if (this.isGoogleLoginProcessing) {
				ev.preventDefault();
				return;
			}
			if (!lastLocation || new URL(lastLocation).origin !== new URL(location).origin) {
				logger.info(`will-navigate: ${location}`);
			}
			if (location?.match(/^https?\:\/\/(accounts)?.google.([a-z]+)/)) {
				ev.preventDefault();
				this.handleGoogleLogin(location, view);
			}
		});

		// Handle YouTube Music View navigation, restart internal app service cycle if needed
		view.webContents.on("will-navigate", (ev, location) => {
			if (this.isGoogleLoginProcessing || ev.defaultPrevented) return;
			if (!lastLocation?.match(defaultUrl) && !!location?.match(defaultUrl)) {
				serverMain.emit("app.loadStart");
			} else {
				pushWindowStates(view.webContents.id);
			}
		});
		// Handle YouTube Music View redirects that may require premium subscription
		view.webContents.on("will-redirect", (event) => {
			const url = new URL(event.url);
			if (isPreventedNavOrRedirect(url)) {
				event.preventDefault();
				logger.info(`Handling YouTube Music View navigation: ${event.url}`);
			}

			if (/^(?:www\.)?youtube\.com\/(?:premium|musicpremium)$/i.test(url.hostname + url.pathname)) {
				// Redirecting to Google sign-in page for YouTube Music access, maybe require premium subscription
				this.handleGoogleLogin(GOOGLE_LOGIN_URL, view);
			}
		});
		// view.webContents.on("did-finish-load", () => {
		// 	if (this._youtubeReady) return;
		// 	setTimeout(() => {
		// 		if (this._youtubeReady) return;
		// 		logger.warn("app.loadEnd fallback after youtube did-finish-load");
		// 		serverMain.emit("app.loadEnd");
		// 	}, 2500);
		// });
		view.webContents.on("page-title-updated", (ev, title) => view.webContents.emit("window-title-updated", title));
	}

	private async handleGoogleLogin(location: string, view: WebContentsView) {
		if (this.isGoogleLoginProcessing) return;
		this.isGoogleLoginProcessing = true;
		let isAuthenticated = false;
		try {
			isAuthenticated = await googleLoginPopup(location, this.mainWindow!);
		} catch (error) {
			logger.error("Error handling Google login", error);
		} finally {
			this.isGoogleLoginProcessing = false;
		}
		if (view.webContents.isDestroyed()) return;
		if (isAuthenticated) {
			// Release the navigation guard before reloading. The normal navigation and
			// preload readiness events own this document's loading cover.
			view.webContents.reload();
		} else {
			// A cancelled navigation can start loading without replacing the document.
			serverMain.emit("app.loadEnd");
		}
	}
	private _youtubeReady: boolean = false;
	get youtubeReady() {
		return this._youtubeReady;
	}
	private setupViewEvents() {
		const gate = new MusicLoadGate();
		const handleLoadEnd = () => {
			void gate.complete(async () => {
				const themes = getLifecycleContext().getProvider("themes") as ThemesProvider | undefined;
				// Initial preload readiness can arrive before createRootWindow returns.
				if (themes && themes.windowContext?.views?.youtubeView !== this.views?.youtubeView) {
					await new Promise<void>((resolve) => serverMain.once("app.windowsReady", resolve));
				}
				try {
					await themes?.reapplyAllStyles();
				} catch (error) {
					// A broken custom stylesheet must not leave the app behind a cover.
					logger.error("Unable to prepare music theme", error);
				}
				const contents = this.views?.youtubeView.webContents;
				if (!contents || contents.isDestroyed()) return;
				await contents.executeJavaScript(`(async () => {
					await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
					await Promise.race([new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))), new Promise(resolve => setTimeout(resolve, 250))]);
				})()`).catch(() => undefined);
			}, () => {
				if (!this.mainWindow || !this.loadingView || !this.views) return;
				applyYoutubeZoom();
				logger.debug("Revealing music view after theme and font preparation");
				this.mainWindow.contentView.removeChildView(this.loadingView);
				if (!playerMode().active) this.mainWindow.contentView.addChildView(this.views.toolbarView);
				this._youtubeReady = true;
			}).catch((error) => logger.error("Unable to finish music loading", error));
		};
		const handleLoadStart = () => {
			gate.start();
			this._youtubeReady = false;
			if (!this.mainWindow || !this.loadingView || !this.views || playerMode().active) return;
			if (!this.mainWindow.contentView.children?.includes(this.loadingView)) {
				this.mainWindow.contentView.addChildView(this.loadingView);
			}
		};
		// Cover reloads before the new document can paint; SPA browsing stays visible.
		this.views?.youtubeView.webContents.on("did-start-navigation", (event) => {
			if (this.isGoogleLoginProcessing || isGoogleLoginUrl(new URL(event.url))) return;
			if (event.isMainFrame && !event.isSameDocument) handleLoadStart();
		});

		serverMain.on("app.loadEnd", handleLoadEnd);
		serverMain.on("app.loadStart", handleLoadStart);
	}
	private fromMaximized = false;
	private setupWindowEvents() {
		if (!this.mainWindow || !this.views) return;
		bindWindowDisplayScale(this.mainWindow, () => {
			this.updateViewBounds();
			applyYoutubeZoom();
		});
		this.mainWindow.on("maximize", () => {
			this.fromMaximized = true;
			this.updateViewBounds();
		});
		this.mainWindow.on("unmaximize", () => {
			this.fromMaximized = false;
			this.updateViewBounds();
		});
		this.mainWindow.on(
			"resize",
			debounce(() => {
				this.updateViewBounds();
			}, 100),
		);
	}
	private updateViewBounds() {
		if (!this.mainWindow || !this.views) return;

		if (playerMode().active) {
			playerMode().layout();
			return;
		}
		const [winWidth, winHeight] = this.mainWindow.getContentSize();
		this.loadingView?.setBounds({ x: 0, y: 0, width: winWidth, height: winHeight });
		logger.debug("updateViewBounds", { winWidth, winHeight, toolbarH: TOOLBAR_HEIGHT });
		this.views.toolbarView.setBounds({
			x: 0,
			y: 0,
			width: winWidth,
			height: TOOLBAR_HEIGHT,
		});
		this.views.youtubeView.setBounds({
			x: 0,
			y: TOOLBAR_HEIGHT,
			width: winWidth,
			height: winHeight - TOOLBAR_HEIGHT,
		});
	}
	private async initializeWindowState(bounds: { width: number; height: number }) {
		if (!this.mainWindow || !this.views) return;

		const { state, saveState } = await wrapWindowHandler(this.mainWindow, "root", { ...bounds, persist: () => !playerMode().active });

		playerMode().setFullStateSaver(saveState);
		if (state?.maximized) {
			this.mainWindow.maximize();
		} else {
			this.mainWindow.setBounds({ ...state });
			logger.debug("initializeWindowState", state);
		}

		// callWindowListeners(this.mainWindow, "will-resize", state);
		serverMain.emit("app.loadStart");
		logger.debug("windowState", this.mainWindow.getBounds());

		await this.views.youtubeView.webContents.loadURL(defaultUrl).then(() => {

			if (process.platform === "darwin") {
				const bounds = getBoundsWithScaleFactor(this.mainWindow!);
				this.mainWindow!.setBounds({
					width: bounds.width + 1,
				});
				this.mainWindow!.setBounds({
					width: bounds.width - 1,
				});
			}
		});
	}

	getWindow() {
		return this.mainWindow;
	}

	getViews() {
		return this.views;
	}
}
