import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, WebContentsView } from "electron";

vi.mock("./menu", () => ({ installPlayerModeMenu: () => vi.fn() }));
vi.mock("./access", () => ({ registerPlayer: () => vi.fn() }));
vi.mock("@main/ytm/ytm-client", () => ({
  YtmClient: { cmdTimed: vi.fn().mockResolvedValue(null) },
}));
vi.mock("@main/domain/uiZoom", () => ({ lockAppChromeZoom: vi.fn() }));
vi.mock("@main/infra/devUtils", () => ({ isDevelopment: false }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 2560, height: 2000 } }) },
    WebContentsView: class {
      webContents = Object.assign(new EventEmitter(), {
        id: 123,
        isDestroyed: () => false,
        close: vi.fn(),
        closeDevTools: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        session: { setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() },
        loadFile: vi.fn().mockResolvedValue(null),
        send: vi.fn(),
        focus: vi.fn(),
      });
      setVisible = vi.fn();
      setBounds = vi.fn();
      setBackgroundColor = vi.fn();
    },
  };
});
import { WebContentsView as View } from "electron";
import { PlayerMode } from "./mode";
import { SkinWindowSizes } from "./window-sizes";

function windowMock() {
  const win = Object.assign(new EventEmitter(), {
    size: [1100, 900],
    fullscreen: false,
    maximized: false,
    getBackgroundColor: () => "#000000",
    isDestroyed: () => false,
    getContentSize: () => [...win.size],
    getSize: () => [...win.size],
    getBounds: () => ({ x: 10, y: 10, width: win.size[0], height: win.size[1] }),
    getNormalBounds: () => ({ x: 10, y: 10, width: 1100, height: 900 }),
    setBounds: (bounds: { width: number; height: number }) => {
      win.size = [bounds.width, bounds.height];
      win.emit("resize");
    },
    setContentSize: (width: number, height: number) => {
      win.size = [width, height];
      win.emit("resize");
    },
    isAlwaysOnTop: () => false,
    isMaximized: () => win.maximized,
    isFullScreen: () => win.fullscreen,
    isMinimized: () => false,
    setMinimumSize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setWindowButtonVisibility: vi.fn(),
    setBackgroundColor: vi.fn(),
    setVibrancy: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  });
  return win;
}

describe("saved player window sizes", () => {
  let data: Record<string, unknown>;
  let sizes: SkinWindowSizes;
  beforeEach(() => {
    vi.useFakeTimers();
    data = {};
    sizes = new SkinWindowSizes({
      get: (key) => data[key],
      set: (key, value) => {
        data[key] = value;
      },
    });
  });
  afterEach(() => vi.useRealTimers());
  function setup(id = "skin-a", width = 620) {
    const win = windowMock();
    const mode = new PlayerMode(
      win as unknown as BrowserWindow,
      new View(),
      new View(),
      vi.fn(),
      () => ({ id, width }),
      sizes,
    );
    return { win, mode };
  }
  it("limits panel resizing to the display work area", async () => {
    const { win, mode } = setup();
    await mode.enter();
    mode.resizeHeight(2400);
    expect(win.size).toEqual([620, 2000]);
  });
  it("restores independent sizes after switching, reopening and restarting", async () => {
    const { win, mode } = setup();
    await mode.enter();
    expect(win.size).toEqual([620, 800]);
    win.setContentSize(750, 950);
    mode.selectSkin({ id: "skin-b", width: 500 });
    expect(win.size).toEqual([500, 800]);
    win.setContentSize(850, 1050);
    mode.selectSkin({ id: "skin-a", width: 620 });
    expect(win.size).toEqual([750, 950]);
    await mode.full();
    expect(win.size).toEqual([1100, 900]);
    await mode.enter();
    expect(win.size).toEqual([750, 950]);
    const restarted = setup("skin-b", 500);
    await restarted.mode.enter();
    expect(restarted.win.size).toEqual([850, 1050]);
  });
  it("debounces normal resizing and flushes the final size on close", async () => {
    const { win, mode } = setup();
    await mode.enter();
    win.setContentSize(700, 880);
    vi.advanceTimersByTime(100);
    win.setContentSize(720, 920);
    expect(sizes.get("skin-a")).toBeNull();
    vi.advanceTimersByTime(250);
    expect(sizes.get("skin-a")).toEqual({ width: 720, height: 920 });
    win.setContentSize(800, 1000);
    win.emit("close");
    expect(sizes.get("skin-a")).toEqual({ width: 800, height: 1000 });
  });
  it("keeps fullscreen and maximized sizes out of the saved dimensions", async () => {
    const { win, mode } = setup();
    await mode.enter();
    win.setContentSize(730, 930);
    win.fullscreen = true;
    win.setContentSize(1920, 1080);
    vi.advanceTimersByTime(300);
    expect(sizes.get("skin-a")).toEqual({ width: 730, height: 930 });
    win.fullscreen = false;
    win.maximized = true;
    win.setContentSize(1600, 1000);
    vi.advanceTimersByTime(300);
    expect(sizes.get("skin-a")).toEqual({ width: 730, height: 930 });
  });
  it("ignores invalid saved dimensions and permits widths above the default", async () => {
    data.playerSkinSizes = { "skin-a": { width: NaN, height: -1 } };
    const { win, mode } = setup();
    await mode.enter();
    expect(win.size).toEqual([620, 800]);
    sizes.save("skin-b", { width: 1400, height: 1200 });
    mode.selectSkin({ id: "skin-b", width: 500 });
    expect(win.size).toEqual([1400, 1200]);
  });
});
