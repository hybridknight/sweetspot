import type { BrowserWindow } from "electron";
/** Change an app-owned hash route without reloading the Settings renderer or its session. */
export async function navigateSettingsWindow(win: BrowserWindow, page: string) {
  const hash = `#${page.startsWith("/") ? page : `/${page}`}`;
  if (new URL(win.webContents.getURL()).hash === hash) return;
  await win.webContents.executeJavaScript(`window.location.hash = ${JSON.stringify(hash)}`);
}
/** Settings is an independent window. Position it near the player only on first open. */
export function showIndependentSettingsWindow(
  win: BrowserWindow,
  main: BrowserWindow,
  initial = false,
) {
  win.setParentWindow(null);
  if (initial && !main.isDestroyed()) {
    const parent = main.getBounds(),
      bounds = win.getBounds();
    win.setPosition(
      Math.round(parent.x + (parent.width - bounds.width) / 2),
      Math.round(parent.y + (parent.height - bounds.height) / 2),
    );
  }
  win.show();
  win.moveTop();
  win.focus();
}
