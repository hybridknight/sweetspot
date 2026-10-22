import { lockAppChromeZoom } from "@main/domain/uiZoom";
import { defaultUrl, isProduction } from "@main/infra/devUtils";
import { getGoogleLoginUserAgent } from "@main/infra/userAgent";
import { bounded, SignInError } from "@main/signIn/async";
import { isMusicUrl, SIGNED_IN_SCRIPT } from "@shared/signIn";
import {
  BrowserWindow,
  BrowserWindowConstructorOptions,
  screen,
  WebContentsView,
  WebContentsViewConstructorOptions,
  WebPreferences,
} from "electron";
import { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { LockSizeOptions, loadUrlOfWebContents, lockSizeToParent } from "./webContentUtils";

type CreateApiViewOptions = { lockSize: LockSizeOptions } & Pick<WebPreferences, "transparent">;
export const createApiView = async <T extends WebContentsView>(
  path: string,
  postFunc?: (ctx: T) => Promise<void> | void,
  options?: CreateApiViewOptions,
): Promise<T> => {
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
  try {
    await loadUrlOfWebContents(view.webContents, path);
  } catch (error) {
    if (!view.webContents.isDestroyed()) view.webContents.close();
    throw error;
  }
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

export interface GoogleLoginOptions {
  signal?: AbortSignal;
  session?: Electron.Session;
  timeoutMs?: number;
}

/** Embedded fallback. Completion requires a signed-in music document, not just a redirect. */
export const googleLoginPopup = async (
  authUrl: string,
  parent?: Electron.BrowserWindow,
  options: GoogleLoginOptions = {},
): Promise<boolean> => {
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const { workAreaSize } = parent
    ? screen.getDisplayMatching(parent.getBounds())
    : screen.getPrimaryDisplay();
  const width = Math.min(840, workAreaSize.width),
    height = Math.min(820, workAreaSize.height);
  const popup = new BrowserWindow({
    icon: appIconPath,
    title: "Sign in · Sweet Spot",
    width,
    height,
    minWidth: Math.min(640, width),
    minHeight: Math.min(560, height),
    resizable: true,
    maximizable: true,
    minimizable: false,
    fullscreenable: false,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0a0a0a",
    ...(parent ? { parent } : {}),
    webPreferences: { nodeIntegration: false, sandbox: true, contextIsolation: true },
  });
  popup.setMenu(null);
  let noticeView: WebContentsView | undefined;
  let loginView: WebContentsView | undefined;
  try {
    // If loading is aborted, dispose even when the async view creation finishes later.
    const notice = createApiView("youtube/login-notice");
    void notice.then(
      (view) => {
        if ((signal.aborted || popup.isDestroyed()) && !view.webContents.isDestroyed())
          view.webContents.close();
      },
      () => undefined,
    );
    noticeView = await bounded(notice, signal, 15_000);
    signal.throwIfAborted();
    if (popup.isDestroyed()) return false;
    loginView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        sandbox: true,
        contextIsolation: true,
        allowRunningInsecureContent: false,
        ...(options.session ? { session: options.session } : {}),
      },
    });
    const contents = loginView.webContents;
    contents.setUserAgent(getGoogleLoginUserAgent());
    // Keep the complete login in this session, including Google verification popups.
    contents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (
          parsed.protocol === "https:" &&
          (parsed.hostname === "accounts.google.com" || parsed.hostname === "accounts.youtube.com")
        ) {
          void contents.loadURL(url).catch(() => undefined);
        }
      } catch {
        /* unsupported URL */
      }
      return { action: "deny" };
    });
    popup.contentView.addChildView(noticeView);
    popup.contentView.addChildView(loginView);
    const resize = () => {
      if (popup.isDestroyed()) return;
      const [w, h] = popup.getContentSize();
      const noticeHeight = 150;
      noticeView!.setBounds({ x: 0, y: 0, width: w, height: noticeHeight });
      loginView!.setBounds({
        x: 0,
        y: noticeHeight,
        width: w,
        height: Math.max(0, h - noticeHeight),
      });
    };
    resize();
    popup.on("resize", resize);
    popup.show();
    return await new Promise<boolean>((resolve, reject) => {
      let settled = false,
        checking = false;
      const finish = (success: boolean, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearInterval(poll);
        signal.removeEventListener("abort", abort);
        popup.removeListener("closed", closed);
        contents.removeListener("render-process-gone", crashed);
        contents.removeListener("did-fail-load", loadFailed);
        parent?.removeListener("closed", abort);
        if (error) reject(error);
        else resolve(success);
      };
      const closed = () => finish(false);
      const abort = () => finish(false);
      const crashed = () => finish(false, new SignInError("browser"));
      const loadFailed = (
        _event: Electron.Event,
        code: number,
        _description: string,
        _url: string,
        mainFrame: boolean,
      ) => {
        if (mainFrame && code !== -3) finish(false, new SignInError("browser"));
      };
      const timeout = setTimeout(
        () => finish(false, new SignInError("timeout")),
        options.timeoutMs ?? 10 * 60_000,
      );
      const poll = setInterval(() => {
        if (settled || checking || contents.isDestroyed() || !isMusicUrl(contents.getURL())) return;
        checking = true;
        void bounded(contents.executeJavaScript(SIGNED_IN_SCRIPT), signal, 3000)
          .then(async (authenticated) => {
            if (authenticated !== true || settled) return;
            try {
              await contents.session.cookies.flushStore();
              if (!signal.aborted) finish(true);
            } catch {
              finish(false, new SignInError("transfer"));
            }
          })
          .catch(() => undefined)
          .finally(() => {
            checking = false;
          });
      }, 500);
      popup.once("closed", closed);
      contents.once("render-process-gone", crashed);
      contents.on("did-fail-load", loadFailed);
      parent?.once("closed", abort);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      void contents
        .loadURL(authUrl, { httpReferrer: defaultUrl })
        .catch((error: { errno?: number; code?: string }) => {
          if (error.errno === -3 || error.code === "ERR_ABORTED") return;
          if (!contents.isDestroyed() && !isMusicUrl(contents.getURL()))
            finish(false, new SignInError("browser"));
        });
    });
  } finally {
    if (!popup.isDestroyed()) popup.destroy();
    // WebContentsView children are not destroyed automatically with their parent.
    for (const view of [noticeView, loginView])
      if (view && !view.webContents.isDestroyed()) view.webContents.close();
  }
};
