import { randomUUID } from "node:crypto";
import { isMusicUrl, SIGNED_IN_SCRIPT } from "@shared/signIn";
import { BrowserWindow, type CookiesSetDetails, type Session, session } from "electron";
import { bounded, checkAbort, pause, SignInError } from "./async";
import { type BrowserCookie, browserCookies, isYoutubeDomain, storedCookie } from "./cookies";

/** Use a real browser document, without any app preload or exposed Node API. */
export async function verifySession(
  ses: Session,
  userAgent: string,
  signal: AbortSignal,
): Promise<void> {
  checkAbort(signal);
  const probe = new BrowserWindow({
    show: false,
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  probe.webContents.setUserAgent(userAgent);
  probe.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  try {
    await bounded(probe.loadURL("https://music.youtube.com/"), signal, 30_000);
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      checkAbort(signal);
      if (!isMusicUrl(probe.webContents.getURL())) throw new SignInError("transfer");
      if (
        (await bounded(probe.webContents.executeJavaScript(SIGNED_IN_SCRIPT), signal, 3000)) ===
        true
      )
        return;
      await pause(300, signal);
    }
    throw new SignInError("transfer");
  } finally {
    if (!probe.isDestroyed()) probe.destroy();
  }
}

export async function writeCookies(
  ses: Session,
  cookies: CookiesSetDetails[],
  signal: AbortSignal,
): Promise<void> {
  for (const cookie of cookies) {
    checkAbort(signal);
    // Electron writes aren't abortable. Await each write before rollback can begin.
    await ses.cookies.set(cookie);
  }
  checkAbort(signal);
}

export async function replaceYoutubeCookies(
  ses: Session,
  cookies: CookiesSetDetails[],
): Promise<void> {
  for (const cookie of await ses.cookies.get({})) {
    if (cookie.domain && isYoutubeDomain(cookie.domain))
      await ses.cookies.set({ ...storedCookie(cookie), value: "", expirationDate: 1 });
  }
  for (const cookie of cookies) await ses.cookies.set(cookie);
  await ses.cookies.flushStore();
}

/** Injectable verification keeps rollback paths deterministic under test. */
export async function commitSession(
  ses: Session,
  cookies: CookiesSetDetails[],
  signal: AbortSignal,
  verify: () => Promise<void>,
): Promise<void> {
  const snapshot = (await ses.cookies.get({}))
    .filter((cookie) => cookie.domain && isYoutubeDomain(cookie.domain))
    .map(storedCookie);
  checkAbort(signal);
  try {
    // Replace the YouTube scope, so old account cookies cannot mix with the new session.
    await replaceYoutubeCookies(ses, []);
    await writeCookies(ses, cookies, signal);
    await verify();
    checkAbort(signal);
    await ses.cookies.flushStore();
    checkAbort(signal);
  } catch (error) {
    try {
      await replaceYoutubeCookies(ses, snapshot);
    } catch {
      throw new SignInError("rollback");
    }
    throw error;
  }
}

export async function transferSession(
  captured: BrowserCookie[],
  destination: Session,
  userAgent: string,
  signal: AbortSignal,
  verify = verifySession,
): Promise<void> {
  const cookies = browserCookies(captured);
  const staging = session.fromPartition(`signin-${randomUUID()}`, { cache: false });
  try {
    await writeCookies(staging, cookies, signal);
    await verify(staging, userAgent, signal);
    checkAbort(signal);
    // Include any legitimate cookie renewals made by the staged music page.
    const verified = (await staging.cookies.get({}))
      .filter((cookie) => cookie.domain && isYoutubeDomain(cookie.domain))
      .map(storedCookie);
    await commitSession(destination, verified, signal, () =>
      verify(destination, userAgent, signal),
    );
  } finally {
    await staging.clearStorageData().catch(() => undefined);
    await staging.closeAllConnections().catch(() => undefined);
  }
}
