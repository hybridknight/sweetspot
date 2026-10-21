import { lockAppChromeZoom } from "@main/domain/uiZoom";
import { defaultUrl, isProduction } from "@main/infra/devUtils";
import { getGoogleLoginUserAgent } from "@main/infra/userAgent";
import { createLogger } from "@shared/utils/console";
import translations from "@translations/index";
import { BrowserWindow, BrowserWindowConstructorOptions, ipcMain, screen, shell, WebContentsView, WebContentsViewConstructorOptions, WebPreferences } from "electron";
import { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { LockSizeOptions, loadUrlOfWebContents, lockSizeToParent } from "./webContentUtils";

const log = createLogger("windows").child("view");

type CreateApiViewOptions = { lockSize: LockSizeOptions } & Pick<WebPreferences, "transparent">;
export const createApiView = async <T extends WebContentsView>(path: string, postFunc?: (ctx: T) => Promise<void> | void, options?: CreateApiViewOptions): Promise<T> => {
	const view = new WebContentsView({
		webPreferences: {
			nodeIntegration: true,
			sandbox: false,
			contextIsolation: true,
			webSecurity: isProduction,
			allowRunningInsecureContent: !isProduction,
			backgroundThrottling: false,
			preload: join(__dirname, "../preload/api.js"),
			transparent: options?.transparent,
		},
	}) as T;
	view.webContents.setBackgroundThrottling(false);
	lockAppChromeZoom(view.webContents);
	await loadUrlOfWebContents(view.webContents, path);
	if (postFunc) await Promise.resolve(postFunc(view));
	const wnd = BrowserWindow.fromWebContents(view.webContents);
	if (wnd) lockSizeToParent(wnd, options?.lockSize)(view);
	return view;
};
export const createView = async <T extends WebContentsView>(
	preload: string,
	postFunc?: (ctx: T) => Promise<void> | void,
	options: WebContentsViewConstructorOptions["webPreferences"] = {},
): Promise<T> => {
	const view = new WebContentsView({
		webPreferences: {
			disableHtmlFullscreenWindowResize: true,
			nodeIntegration: true,
			sandbox: false,
			webSecurity: isProduction,
			allowRunningInsecureContent: !isProduction,
			contextIsolation: true,
			backgroundThrottling: false,
			...options,
			preload,
		},
	}) as T;
	view.webContents.setBackgroundThrottling(false);
	if (postFunc) await Promise.resolve(postFunc(view));
	const wnd = BrowserWindow.fromWebContents(view.webContents);
	if (wnd) lockSizeToParent(wnd)(view);
	return view;
};
export const createPopup = async (options?: BrowserWindowConstructorOptions) => {
	const wnd = new BrowserWindow({
		minHeight: 400,
		minWidth: 400,
		...(options ? options : {}),
		webPreferences: {
			disableHtmlFullscreenWindowResize: true,
			nodeIntegration: true,
			sandbox: false,
			webSecurity: isProduction,
			contextIsolation: false, // window object is required to be rewritten for tracking current track
			...(options?.webPreferences ? options.webPreferences : {}),
		},
	});

	const lockSize = lockSizeToParent(wnd);
	return { popup: wnd, lockSize };
};

export const googleLoginPopup = async (authUrl: string, parent?: Electron.BrowserWindow) => {
	const webPreferences: Electron.WebPreferences = {
		nodeIntegration: false,
		nodeIntegrationInSubFrames: false,
		nodeIntegrationInWorker: false,
		webSecurity: isProduction,
		sandbox: false,
		contextIsolation: true,
		allowRunningInsecureContent: false,
		preload: join(__dirname, "../preload/login.js"),
	};
	const { workAreaSize } = parent ? screen.getDisplayMatching(parent.getBounds()) : screen.getPrimaryDisplay();
	const width = Math.min(800, workAreaSize.width);
	const height = Math.min(760, workAreaSize.height);
	const { popup } = await createPopup({
		icon: appIconPath,
		title: translations.appName,
		height,
		width,
		minWidth: Math.min(640, width),
		minHeight: Math.min(480, height),
		resizable: true,
		maximizable: true,
		frame: false,
		...(process.platform === "darwin" ? { transparent: true, titleBarStyle: "hiddenInset" as const } : {}),
		fullscreenable: false,
		minimizable: false,
		alwaysOnTop: true,
		autoHideMenuBar: true,
		webPreferences,
		// Use a regular child window on macOS so sign-in has the main window's
		// corner treatment instead of the larger native modal-sheet corners.
		...((parent && { parent, modal: process.platform !== "darwin" }) || {}),
	});
	popup.setMenu(null);
	if (process.platform === "darwin") popup.setWindowButtonVisibility(false);
	const noticeView = await createApiView("youtube/login-notice");
	popup.contentView.addChildView(noticeView);
	const noticeHeight = 120;
	const loginView = new WebContentsView({
		webPreferences,
	});
	loginView.webContents.setUserAgent(getGoogleLoginUserAgent());
	popup.contentView.addChildView(loginView, 0);
	// Keep Google's action buttons reachable when the form grows or the user
	// resizes the window to reach another verification method.
	const updateLoginBounds = () => {
		const [contentWidth, contentHeight] = popup.getContentSize();
		noticeView.setBounds({ height: noticeHeight, width: contentWidth, x: 0, y: 0 });
		loginView.setBounds({ height: Math.max(0, contentHeight - noticeHeight), width: contentWidth, x: 0, y: noticeHeight });
	};
	updateLoginBounds();
	popup.on("resize", updateLoginBounds);
	popup.once("closed", () => popup.removeListener("resize", updateLoginBounds));
	loginView.webContents.setWindowOpenHandler(({ url }) => {
		if (!url.startsWith("http")) {
			return { action: "deny" };
		}
		if (/^https?\:\/\/([a-zA-Z0-9]+)?\.google\.([a-z]+)/.test(url)) {
			shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "allow" };
	});

	let timeoutHandler: NodeJS.Timeout; // timeout after 10 minutes
	const clearGC = () => {
		timeoutHandler && clearTimeout(timeoutHandler);
	};
	const closeLoginView = () => {
		if (!popup.isDestroyed()) popup.close();
		clearGC();
	};
	ipcMain.once("subwindow.close/loginView", closeLoginView);
	popup.once("closed", () => ipcMain.removeListener("subwindow.close/loginView", closeLoginView));
	const isMusicYoutubeUrl = (url: string) => {
		try {
			return new URL(url).hostname.indexOf("music.youtube") === 0;
		} catch {
			return false;
		}
	};
	return await new Promise<boolean>((resolve, reject) => {
		timeoutHandler = setTimeout(
			() => {
				reject();
			},
			10 * 60 * 1000,
		);
		let isAuthenticated = false;
		const markAuthenticated = () => {
			if (isAuthenticated) return;
			isAuthenticated = true;
			popup.close();
		};
		popup.on("close", () => {
			resolve(isAuthenticated);
			clearGC();
		});
		// Already logged in → Google lands on music.youtube during/after load.
		// Attach before loadURL so we don't miss the redirect race.
		const onMusicRedirect = (_ev: Electron.Event, url: string) => {
			if (isMusicYoutubeUrl(url)) markAuthenticated();
		};
		loginView.webContents.on("will-redirect", onMusicRedirect);
		loginView.webContents.on("will-navigate", onMusicRedirect);
		loginView.webContents.on("did-navigate", onMusicRedirect);
		loginView.webContents.on("did-navigate-in-page", onMusicRedirect);
		loginView.webContents.on("ipc-message", (_ev, eventName) => {
			log.debug("login event", eventName);
			if (eventName === "g-login-success") {
				markAuthenticated();
			}
		});

		void loginView.webContents
			.loadURL(authUrl, {
				httpReferrer: defaultUrl,
			})
			.then(() => {
				if (isMusicYoutubeUrl(loginView.webContents.getURL())) markAuthenticated();
			})
			.catch(() => {
				/* popup close / abort */
			});
	});
};
