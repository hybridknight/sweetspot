import { join } from "node:path";
import { lockAppChromeZoom } from "@main/domain/uiZoom";
import { isDevelopment } from "@main/infra/devUtils";
import { YtmClient } from "@main/ytm/ytm-client";
import { BrowserWindow, screen, WebContentsView } from "electron";
import { BehaviorSubject } from "rxjs";
import { registerPlayer } from "./access";
import { installPlayerModeMenu } from "./menu";
import { type PlayerSkin, type PlayerWindowSize, type SkinWindowSizes } from "./window-sizes";

export type VideoBounds = { x: number; y: number; width: number; height: number; pictureFrame?: boolean } | null;
/** Native media view moves between full UI and a skin's video slot. No second player. */
export class PlayerMode {
  private originalBackground: string;
  private view: WebContentsView | null = null;
  private fullBounds: Electron.Rectangle | null = null;
  private fullMaximized = false;
  private fullOnTop = false;
  private playerPinned = false;
  private saveFullState = () => {};
  private video: VideoBounds = null;
  private videoFullscreen = false;
  private videoCss: string | null = null;
  private videoTask: Promise<void> = Promise.resolve();
  private activeSkin: string | null = null;
  private restoringSize = false;
  private sizeTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingSize: { id: string; size: PlayerWindowSize } | null = null;
  active = false;
  // Replay the current mode to tray windows opened after a transition.
  readonly modeChanges = new BehaviorSubject(false);
  private updateModeMenu: (active: boolean) => void;
  private entering: Promise<void> | null = null;
  constructor(
    private win: BrowserWindow,
    private youtube: WebContentsView,
    private toolbar: WebContentsView,
    private layoutFull: () => void,
    private preferredSkin: () => PlayerSkin = () => ({ id: "builtin-default", width: 620 }),
    private sizes?: SkinWindowSizes,
  ) {
    this.originalBackground = win.getBackgroundColor();
    this.updateModeMenu = installPlayerModeMenu({
      player: () => this.enter(),
      full: () => this.full(),
    });
    win.on("resize", () => {
      this.layout();
      this.rememberSize();
    });
    win.on("close", () => {
      this.rememberSize();
      this.flushSize();
    });
    win.on("show", () => this.layout());
    win.on("maximize", () => this.layout());
    win.on("unmaximize", () => this.layout());
    win.on("closed", () => {
      this.flushSize();
      this.modeChanges.complete();
      if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    });
    win.on("enter-full-screen", () => this.layout());
    win.on("leave-full-screen", () => {
      if (this.videoFullscreen) this.restoreVideoPane();
      else this.layout();
    });
    youtube.webContents.on("enter-html-full-screen", () => {
      if (!this.active || !this.video) return;
      this.videoFullscreen = true;
      this.view?.setVisible(false);
      this.layout();
      youtube.webContents.focus();
    });
    youtube.webContents.on("leave-html-full-screen", () => {
      if (!this.videoFullscreen) return;
      // macOS finishes its native window animation after HTML fullscreen has ended.
      if (!win.isFullScreen()) this.restoreVideoPane();
    });
    youtube.webContents.on("did-finish-load", () => {
      this.videoCss = null;
      if (this.active && this.video) void this.setVideo(this.video);
    });
  }
  setTransparency(enabled: boolean) {
    if (!this.active) return;
    const transparent = enabled && process.platform === "darwin";
    // Changing vibrancy can clear the native background; restore the color afterwards.
    if (process.platform === "darwin") this.win.setVibrancy(transparent ? "under-window" : null);
    this.win.setBackgroundColor(transparent ? "#00000000" : this.originalBackground);
    this.view?.setBackgroundColor(transparent ? "#00000000" : "#1b2028");
  }
  get senderId() {
    return this.view?.webContents.id;
  }
  setFullStateSaver(save: () => void) {
    this.saveFullState = save;
  }
  hasSavedSize(id: string) {
    return !!this.sizes?.get(id);
  }
  private rememberSize() {
    if (
      !this.active ||
      !this.activeSkin ||
      this.restoringSize ||
      this.videoFullscreen ||
      this.win.isDestroyed() ||
      this.win.isFullScreen() ||
      this.win.isMaximized() ||
      this.win.isMinimized()
    )
      return;
    const [width, height] = this.win.getContentSize();
    this.pendingSize = { id: this.activeSkin, size: { width, height } };
    clearTimeout(this.sizeTimer);
    this.sizeTimer = setTimeout(() => this.flushSize(), 250);
  }
  private flushSize() {
    clearTimeout(this.sizeTimer);
    const pending = this.pendingSize;
    this.pendingSize = null;
    if (pending) this.sizes?.save(pending.id, pending.size);
  }
  selectSkin(skin: PlayerSkin) {
    if (!this.active || this.videoFullscreen) return;
    this.rememberSize();
    this.flushSize();
    this.restoreSize(skin);
  }
  private restoreSize(skin: PlayerSkin) {
    const saved = this.sizes?.get(skin.id);
    this.restoringSize = true;
    this.activeSkin = null;
    try {
      this.win.setMinimumSize(360, 480);
      this.win.setContentSize(
        saved?.width ?? Math.min(1000, Math.max(360, skin.width)),
        saved?.height ?? 800,
      );
      this.activeSkin = skin.id;
    } finally {
      this.restoringSize = false;
    }
    return !!saved;
  }
  setMinimumHeight(height: number) {
    if (!this.active || this.videoFullscreen || this.win.isDestroyed()) return;
    const minimum = Math.max(480, Math.min(2400, Math.ceil(height)));
    this.win.setMinimumSize(360, minimum);
    const [width, currentHeight] = this.win.getContentSize();
    if (currentHeight < minimum) this.win.setContentSize(width, minimum);
  }
  resizeHeight(height: number) {
    if (!this.active || this.videoFullscreen || this.win.isDestroyed()) return;
    // The renderer reserves the natural control sizes and freezes neighbouring panels.
    this.win.setMinimumSize(360, 480);
    const workArea = screen.getDisplayMatching(this.win.getBounds()).workArea;
    const frameHeight = this.win.getSize()[1] - this.win.getContentSize()[1];
    this.win.setContentSize(
      this.win.getContentSize()[0],
      Math.max(480, Math.min(2400, workArea.height - frameHeight, Math.ceil(height))),
    );
    const bounds = this.win.getBounds();
    const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - bounds.height));
    if (y !== bounds.y) this.win.setBounds({ ...bounds, y });
  }
  get pinned() {
    return this.playerPinned;
  }
  async enter() {
    if (this.entering) return this.entering;
    this.entering = this.enterOnce().finally(() => {
      this.entering = null;
    });
    return this.entering;
  }
  private async enterOnce() {
    // Chromium's DevTools resize overlay belongs to the native music view and
    // otherwise appears over the skin video as a pixel-size readout.
    this.youtube.webContents.closeDevTools();
    if (this.active) {
      this.win.show();
      return;
    }
    if (!this.view) {
      this.view = new WebContentsView({
        webPreferences: {
          preload: join(__dirname, "../preload/player.js"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          backgroundThrottling: false,
          partition: "player-ui",
        },
      });
      const wc = this.view.webContents;
      const unregister = registerPlayer(wc.id);
      wc.once("destroyed", unregister);
      lockAppChromeZoom(wc);
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      wc.on("will-navigate", (event) => event.preventDefault());
      wc.on("will-redirect", (event) => event.preventDefault());
      wc.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
      wc.session.setPermissionCheckHandler(() => false);
      this.win.contentView.addChildView(this.view);
      this.view.setVisible(false);
      try {
        if (isDevelopment && process.env.ELECTRON_RENDERER_URL)
          await wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/player.html#/skin-player`);
        else
          await wc.loadFile(join(__dirname, "../renderer/player.html"), { hash: "/skin-player" });
      } catch (error) {
        this.win.contentView.removeChildView(this.view);
        wc.close();
        this.view = null;
        throw error;
      }
    }
    this.saveFullState();
    this.fullOnTop = this.win.isAlwaysOnTop();
    this.fullMaximized = this.win.isMaximized();
    this.fullBounds = this.fullMaximized ? this.win.getNormalBounds() : this.win.getBounds();
    this.active = true;
    this.updateModeMenu(true);
    if (process.platform === "darwin") this.win.setWindowButtonVisibility(false);
    if (this.fullMaximized) this.win.unmaximize();
    this.win.setAlwaysOnTop(this.playerPinned);
    const restoredSize = this.restoreSize(this.preferredSkin());
    this.toolbar.setVisible(false);
    this.youtube.setVisible(false);
    this.win.contentView.addChildView(this.view);
    this.view.setVisible(true);
    this.layout();
    this.view.webContents.send("player:shown", { restoredSize });
    this.win.show();
    this.win.focus();
    this.modeChanges.next(true);
  }
  async full() {
    if (!this.active) return;
    if (this.videoFullscreen) {
      const nativeExit = new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.win.removeListener("leave-full-screen", done);
          resolve();
        };
        const timer = setTimeout(done, 3000);
        this.win.once("leave-full-screen", done);
      });
      await this.youtube.webContents
        .executeJavaScript("document.fullscreenElement ? document.exitFullscreen() : undefined")
        .catch(() => {});
      if (this.win.isFullScreen()) await nativeExit;
      this.restoreVideoPane();
    }
    this.rememberSize();
    this.flushSize();
    this.setTransparency(false);
    this.active = false;
    this.activeSkin = null;
    this.updateModeMenu(false);
    if (process.platform === "darwin") this.win.setWindowButtonVisibility(true);
    this.video = null;
    await this.videoTask.catch(() => {});
    await this.removeVideoCss();
    this.view?.setVisible(false);
    this.youtube.setVisible(true);
    this.toolbar.setVisible(true);
    this.win.contentView.addChildView(this.youtube);
    this.win.contentView.addChildView(this.toolbar);
    this.win.setAlwaysOnTop(this.fullOnTop);
    this.win.setMinimumSize(800, 480);
    if (this.fullBounds) this.win.setBounds(this.fullBounds);
    if (this.fullMaximized) this.win.maximize();
    this.layoutFull();
    this.win.show();
    this.win.focus();
    this.modeChanges.next(false);
  }
  private restoreVideoPane() {
    this.videoFullscreen = false;
    if (!this.active) return;
    this.view?.setVisible(true);
    this.layout();
    this.view?.webContents.focus();
  }
  layout() {
    if (!this.active || !this.view || this.win.isDestroyed()) return;
    const [width, height] = this.win.getContentSize();
    if (this.videoFullscreen) {
      // Freeze the skin view's size so fullscreen never rewrites its panel heights.
      this.youtube.setBounds({ x: 0, y: 0, width, height });
      this.youtube.setVisible(true);
      return;
    }
    this.view.setBounds({ x: 0, y: 0, width, height });
    if (this.video) {
      const x = Math.max(0, Math.min(width, Math.round(this.video.x))),
        y = Math.max(0, Math.min(height, Math.round(this.video.y)));
      const w = Math.max(0, Math.min(width - x, Math.round(this.video.width))),
        h = Math.max(0, Math.min(height - y, Math.round(this.video.height)));
      this.youtube.setBounds({ x, y, width: w, height: h });
      this.youtube.setVisible(w > 0 && h > 0);
    } else this.youtube.setVisible(false);
  }
  private async removeVideoCss() {
    // Disable presentation before removing its stylesheet. The plugin bridge can
    // time out during navigation; full mode must still restore the page itself.
    await YtmClient.cmdTimed("api", "skinVideoPresentation", 2000, false).catch(async () => {
      if (this.youtube.webContents.isDestroyed()) return;
      await this.youtube.webContents.executeJavaScript(`(() => {
        const root = document.documentElement;
        root.removeAttribute("data-sweetspot-skin-video-active");
        root.removeAttribute("data-sweetspot-picture-frame");
        root.removeAttribute("data-sweetspot-video-fullscreen");
        root.style.removeProperty("--sweetspot-video-quality-width");
        root.style.removeProperty("--sweetspot-video-quality-height");
        document.querySelectorAll("[data-sweetspot-skin-video]")
          .forEach(element => element.removeAttribute("data-sweetspot-skin-video"));
        document.querySelectorAll("[data-sweetspot-video-controls], [data-sweetspot-video-frame]")
          .forEach(element => element.remove());
      })()`).catch(() => {});
    });
    if (this.videoCss && !this.youtube.webContents.isDestroyed())
      await this.youtube.webContents.removeInsertedCSS(this.videoCss).catch(() => {});
    this.videoCss = null;
    this.youtube.setBackgroundColor(this.originalBackground);
  }
  setVideo(bounds: VideoBounds) {
    if (this.videoFullscreen) return this.videoTask;
    this.videoTask = this.videoTask.catch(() => {}).then(() => this.applyVideo(bounds));
    return this.videoTask;
  }
  private async applyVideo(bounds: VideoBounds) {
    // A request queued before fullscreen can finish after the skin is hidden.
    // Preserve the original pane, including when the stale request is null.
    if (this.videoFullscreen) return;
    this.video = bounds;
    if (!this.active) return;
    if (bounds && !this.videoCss) {
      // YouTube Auto uses controller geometry to cap quality. Give its controller an HD/display-sized
      // layout while the original video stays fitted to the actual native pane. Auto still handles
      // bandwidth, codecs and available resolutions; no fixed quality, seek or media reload.
      // App-owned selectors only. Keep the original media element and audio graph alive.
      this.videoCss = await this.youtube.webContents.insertCSS(
        `html[data-sweetspot-skin-video-active],html[data-sweetspot-skin-video-active] body{background:transparent!important;overflow:hidden!important} html[data-sweetspot-skin-video-active] body *{visibility:hidden!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-skin-video="ancestor"]{display:block!important;visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;margin:0!important;padding:0!important;transform:none!important;opacity:1!important;max-width:none!important;max-height:none!important;min-width:0!important;min-height:0!important;overflow:hidden!important;background:transparent!important;box-shadow:none!important}
        html[data-sweetspot-skin-video-active] body #movie_player[data-sweetspot-skin-video="ancestor"]{width:max(100vw,var(--sweetspot-video-quality-width,1920px))!important;height:max(100vh,var(--sweetspot-video-quality-height,1080px))!important}
        html[data-sweetspot-skin-video-active] body video[data-sweetspot-skin-video="media"]{display:block!important;visibility:visible!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;object-fit:contain!important;background:transparent!important;transform:none!important;z-index:2147483647!important}
        html[data-sweetspot-skin-video-active] body video[data-sweetspot-skin-video="media"]:fullscreen{background:#000!important}
        html[data-sweetspot-skin-video-active]:fullscreen{background:#000!important}
        html[data-sweetspot-skin-video-active] body #movie_player[data-sweetspot-skin-video="ancestor"]:fullscreen{width:100vw!important;height:100vh!important;background:#000!important}
        html[data-sweetspot-skin-video-active][data-sweetspot-picture-frame]:not([data-sweetspot-video-fullscreen]) body video[data-sweetspot-skin-video="media"]:not(:fullscreen){left:3px!important;top:3px!important;right:auto!important;bottom:auto!important;width:calc(100vw - 10px)!important;height:calc(100vh - 10px)!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls],html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls] *{visibility:visible!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls]{position:fixed!important;right:12px!important;bottom:12px!important;z-index:2147483647!important;opacity:0;pointer-events:none;transition:opacity .15s ease;display:flex!important}
        html[data-sweetspot-skin-video-active]:not([data-sweetspot-video-fullscreen]) body:hover [data-sweetspot-video-controls],html[data-sweetspot-skin-video-active]:not([data-sweetspot-video-fullscreen]) body [data-sweetspot-video-controls]:focus-within,html[data-sweetspot-skin-video-active][data-sweetspot-video-fullscreen] body [data-sweetspot-video-controls][data-visible]{opacity:1!important;pointer-events:auto!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls] button{appearance:none!important;-webkit-appearance:none!important;display:grid!important;place-items:center!important;width:36px!important;height:36px!important;padding:0!important;margin:0!important;border:1px solid #ffffff66!important;border-radius:7px!important;background:rgba(0,0,0,.5)!important;box-shadow:none!important;filter:none!important;backdrop-filter:none!important;color:#fff!important;cursor:pointer!important;-webkit-app-region:no-drag}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls] button:focus-visible{outline:2px solid white!important;outline-offset:2px!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls] [role=tooltip]{display:none!important;position:absolute!important;right:0!important;bottom:44px!important;max-width:calc(100vw - 24px)!important;padding:8px 12px!important;border:1px solid #ffffff30!important;border-radius:8px!important;background:#202020!important;color:#fafafa!important;font:14px/1.4 system-ui,sans-serif!important;white-space:nowrap!important;box-shadow:0 4px 16px #0005!important;pointer-events:none!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-controls][data-tooltip-open] [role=tooltip]{display:block!important}
        html[data-sweetspot-skin-video-active] body [data-sweetspot-video-frame]{visibility:visible!important;position:fixed!important;box-sizing:border-box!important;border:3px solid #071509!important;box-shadow:4px 4px 0 #071509!important;pointer-events:none!important;z-index:2147483647!important}`,
        { cssOrigin: "user" },
      );
    }
    if (!bounds) {
      this.youtube.setVisible(false);
      await this.removeVideoCss();
    }
    if (bounds) {
      // The skin supplies its own matte; transparent skins retain their backdrop
      // through letterboxing instead of being covered by the native web view.
      this.youtube.setBackgroundColor("#00000000");
      await YtmClient.cmdTimed("api", "skinVideoPresentation", 2000, true, !!bounds.pictureFrame);
      if (this.videoFullscreen || !this.active) return;
      this.win.contentView.addChildView(this.youtube);
    }
    this.layout();
  }
  pin() {
    this.playerPinned = !this.playerPinned;
    if (this.active) this.win.setAlwaysOnTop(this.playerPinned);
    return this.playerPinned;
  }
  minimize() {
    this.win.minimize();
  }
}
let mode: PlayerMode | null = null;
export function configurePlayerMode(
  win: BrowserWindow,
  youtube: WebContentsView,
  toolbar: WebContentsView,
  layoutFull: () => void,
  preferredSkin?: () => PlayerSkin,
  sizes?: SkinWindowSizes,
) {
  mode = new PlayerMode(win, youtube, toolbar, layoutFull, preferredSkin, sizes);
}
export function playerMode() {
  if (!mode) throw new Error("Player is still loading.");
  return mode;
}
