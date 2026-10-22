import { join } from "node:path";
import { onDestroy, onInit } from "@main/lifecycle";
import { attachTrpcWindow } from "@main/trpc/handler";
import { googleLoginPopup } from "@main/windows/view";
import { loadUrlOfWebContents } from "@main/windows/webContentUtils";
import { GOOGLE_SIGN_IN_URL } from "@shared/signIn";
import { app, BrowserWindow, dialog, type WebContents } from "electron";
import { bounded, SignInError } from "./async";
import { discoverBrowsers } from "./browserDiscovery";
import { signInWithBrowser, sweepProfiles } from "./browserSignIn";
import { SignInFlow } from "./flow";
import { transferSession } from "./sessionTransfer";
import { clearSignInState, setSignInState } from "./state";

onInit(async () => {
  await sweepProfiles(join(app.getPath("userData"), "browser-sign-in")).catch(() => undefined);
});

let active: { controller: AbortController; done: Promise<boolean> } | undefined;
onDestroy(async () => {
  active?.controller.abort();
  await active?.done;
});

export function startSignIn(parent: BrowserWindow, target: WebContents): Promise<boolean> {
  if (active) return active.done;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  parent.once("closed", cancel);
  target.once("destroyed", cancel);
  const done = run(parent, target, controller.signal)
    .catch(async (error) => {
      // A broken app-owned progress renderer must not prevent signing in.
      if (controller.signal.aborted || parent.isDestroyed() || target.isDestroyed()) return false;
      if (error instanceof SignInError && error.code === "rollback") {
        await dialog.showMessageBox(parent, {
          type: "error",
          title: "Sign-in needs a restart",
          message: "Your previous session could not be restored.",
          detail: "Restart Sweet Spot before signing in again.",
          buttons: ["Close"],
        });
        return false;
      }
      return googleLoginPopup(GOOGLE_SIGN_IN_URL, parent, {
        signal: controller.signal,
        session: target.session,
      });
    })
    .finally(() => {
      parent.removeListener("closed", cancel);
      target.removeListener("destroyed", cancel);
      active = undefined;
    });
  active = { controller, done };
  return done;
}

async function run(
  parent: BrowserWindow,
  target: WebContents,
  signal: AbortSignal,
): Promise<boolean> {
  const panel = new BrowserWindow({
    parent,
    title: "Sign in · Sweet Spot",
    width: 520,
    height: 660,
    minWidth: 420,
    minHeight: 480,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#101014",
    autoHideMenuBar: true,
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: join(__dirname, "../preload/api.js"),
    },
  });
  panel.setMenu(null);
  panel.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  panel.webContents.on("will-navigate", (event) => event.preventDefault());
  attachTrpcWindow(panel);
  const root = join(app.getPath("userData"), "browser-sign-in");
  let loaded = false;
  const flow = new SignInFlow({
    discover: async (signal) => {
      await bounded(sweepProfiles(root), signal, 5000).catch(() => undefined);
      return discoverBrowsers(signal);
    },
    browser: (browser, signal, onWaiting, onVerifying, onLaunched) =>
      signInWithBrowser(browser, {
        root,
        signal,
        onWaiting,
        onVerifying,
        onLaunched,
        accept: (cookies) =>
          transferSession(cookies, target.session, target.getUserAgent(), signal),
      }),
    embedded: async (signal) => {
      if (!panel.isDestroyed()) panel.hide();
      return googleLoginPopup(GOOGLE_SIGN_IN_URL, parent, { signal, session: target.session });
    },
    update: (status) => {
      if (panel.isDestroyed()) return;
      setSignInState(flow, panel.webContents.id, status);
      if (loaded && status.stage === "error") {
        panel.show();
        panel.focus();
      }
    },
  });
  setSignInState(flow, panel.webContents.id, { id: flow.id, stage: "discovering" });
  const cancel = () => flow.cancel();
  panel.on("closed", cancel);
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  panel.webContents.once("render-process-gone", () => flow.useEmbedded());
  try {
    await bounded(loadUrlOfWebContents(panel.webContents, "/youtube/sign-in"), signal, 15_000);
    loaded = true;
    if (panel.isDestroyed() || parent.isDestroyed() || target.isDestroyed()) return false;
    panel.show();
    const result = await flow.run();
    if (result && !parent.isDestroyed()) {
      parent.show();
      parent.focus();
    }
    return result;
  } finally {
    flow.cancel();
    clearSignInState(flow.id);
    signal.removeEventListener("abort", cancel);
    if (!panel.isDestroyed()) {
      panel.removeListener("closed", cancel);
      panel.destroy();
    }
  }
}
