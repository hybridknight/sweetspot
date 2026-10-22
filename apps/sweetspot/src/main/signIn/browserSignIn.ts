import { type ChildProcess, execFile, spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { GOOGLE_SIGN_IN_URL, isMusicUrl, SIGNED_IN_SCRIPT } from "@shared/signIn";
import { bounded, checkAbort, pause, SignInError } from "./async";
import type { InstalledBrowser } from "./browserDiscovery";
import { CdpConnection } from "./cdp";
import type { BrowserCookie } from "./cookies";

const exec = promisify(execFile);
const OWNER = "sweetspot-sign-in-v1";

export function parseEndpoint(text: string): string {
  const [port, path] = text.trim().split(/\r?\n/);
  if (
    !/^\d+$/.test(port) ||
    +port < 1 ||
    +port > 65535 ||
    !/^\/devtools\/browser\/[a-z0-9-]+$/i.test(path ?? "")
  )
    throw new SignInError("browser");
  return `ws://127.0.0.1:${port}${path}`;
}

/** Only sweep our marked, inactive profiles. Never follow a symlink or kill a stale PID. */
export async function sweepProfiles(root: string): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^attempt-[a-zA-Z0-9]+$/.test(entry.name)) continue;
    const directory = join(root, entry.name);
    try {
      const owner = JSON.parse(await readFile(join(directory, "sweetspot-owner.json"), "utf8"));
      if (owner.kind !== OWNER || !Number.isSafeInteger(owner.appPid) || owner.appPid < 1) continue;
      try {
        process.kill(owner.appPid, 0);
        continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
      }
      // Unix Chromium uses this symlink to identify the running owner.
      try {
        const lock = await lstat(join(directory, "SingletonLock"));
        if (lock.isSymbolicLink()) {
          const target = await readlink(join(directory, "SingletonLock"));
          const pid = Number(target.match(/-(\d+)$/)?.[1]);
          if (!Number.isSafeInteger(pid) || pid < 1) continue;
          try {
            process.kill(pid, 0);
            continue;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") continue;
          }
        } else continue;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") continue;
      }
      await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
    } catch {
      /* locked profiles are retried at the next sign-in/startup */
    }
  }
}

async function stopBrowser(child: ChildProcess, connection?: CdpConnection): Promise<void> {
  let exited = child.exitCode !== null || child.signalCode !== null || !child.pid;
  const exit = new Promise<void>((resolve) => {
    if (exited) resolve();
    else
      child.once("exit", () => {
        exited = true;
        resolve();
      });
  });
  if (connection)
    await bounded(connection.call("Browser.close"), new AbortController().signal, 1500).catch(
      () => undefined,
    );
  await bounded(exit, new AbortController().signal, 2000).catch(() => undefined);
  if (!exited && child.pid) {
    if (process.platform === "win32") {
      await exec("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        timeout: 3000,
      }).catch(() => undefined);
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* process already gone */
      }
    }
    await bounded(exit, new AbortController().signal, 2000).catch(() => undefined);
  }
  // The browser may exit before its helpers. Reap only the process group we created.
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* owned group already gone */
    }
  }
  connection?.close();
}

export interface BrowserAttemptOptions {
  root: string;
  signal: AbortSignal;
  onWaiting: () => void;
  onLaunched?: () => void;
  startupTimeoutMs?: number;
  timeoutMs?: number;
  onVerifying: () => void;
  // Capture remains private until browser has exited: no second browser can rotate the copied session.
  accept: (cookies: BrowserCookie[]) => Promise<void>;
}

export async function signInWithBrowser(
  browser: InstalledBrowser,
  options: BrowserAttemptOptions,
): Promise<void> {
  const { signal } = options;
  checkAbort(signal);
  await mkdir(options.root, { recursive: true, mode: 0o700 });
  const profile = await mkdtemp(join(options.root, "attempt-"));
  let child: ChildProcess | undefined;
  let connection: CdpConnection | undefined;
  let failed = false;
  let captured: BrowserCookie[] | undefined;
  try {
    await chmod(profile, 0o700);
    await writeFile(
      join(profile, "sweetspot-owner.json"),
      JSON.stringify({ kind: OWNER, appPid: process.pid }),
      { mode: 0o600 },
    );
    checkAbort(signal);
    child = spawn(
      browser.executable,
      [
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
        "--remote-debugging-address=127.0.0.1",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-sync",
        "--disable-background-mode",
        "--disable-blink-features=AutomationControlled",
        "--new-window",
        GOOGLE_SIGN_IN_URL,
      ],
      { stdio: "ignore", detached: process.platform !== "win32", windowsHide: false },
    );
    child.once("spawn", () => options.onLaunched?.());
    child.on("error", () => {
      failed = true;
    });
    const closed = () => failed || child?.exitCode !== null || child?.signalCode !== null;
    const startup = Date.now() + (options.startupTimeoutMs ?? 15_000);
    let endpoint: string | undefined;
    while (!endpoint) {
      checkAbort(signal);
      if (closed()) throw new SignInError("browser");
      if (Date.now() >= startup) throw new SignInError("timeout");
      try {
        endpoint = parseEndpoint(await readFile(join(profile, "DevToolsActivePort"), "utf8"));
      } catch {
        /* file can be incomplete while starting */
      }
      if (!endpoint) await pause(150, signal);
    }
    connection = await CdpConnection.connect(endpoint, signal);
    options.onWaiting();
    const deadline = Date.now() + (options.timeoutMs ?? 5 * 60_000);
    let stableSince = 0;
    while (!captured) {
      checkAbort(signal);
      if (closed()) throw new SignInError("browser");
      if (Date.now() >= deadline) throw new SignInError("timeout");
      const { cookies } = await bounded(
        connection.call<{ cookies: BrowserCookie[] }>("Storage.getCookies"),
        signal,
        6000,
      );
      // Page authentication and transfer compatibility are different stages.
      // A valid music page must not wait forever because one cookie cannot map.
      if (await signedInPage(connection, signal)) {
        if (!stableSince) stableSince = Date.now();
        if (Date.now() - stableSince >= 3000) captured = cookies;
      } else stableSince = 0;
      if (!captured) await pause(1000, signal);
    }
    options.onVerifying();
  } finally {
    if (child) await stopBrowser(child, connection);
    else connection?.close();
    // rm never traverses outside this randomly generated profile.
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(
      () => undefined,
    );
  }
  checkAbort(signal);
  if (!captured) throw new SignInError("browser");
  await options.accept(captured);
}

async function signedInPage(connection: CdpConnection, signal: AbortSignal): Promise<boolean> {
  const { targetInfos } = await bounded(
    connection.call<{ targetInfos: { type: string; url: string; targetId: string }[] }>(
      "Target.getTargets",
    ),
    signal,
    6000,
  );
  for (const target of targetInfos) {
    try {
      const url = new URL(target.url);
      if (
        target.type === "page" &&
        (url.protocol === "chrome-error:" ||
          (url.hostname === "accounts.google.com" &&
            /deniedsigninrejected|\/rejected|\/signin\/error/i.test(url.pathname)))
      )
        throw new SignInError("browser");
    } catch (error) {
      if (error instanceof SignInError) throw error;
    }
  }
  for (const target of targetInfos.filter(
    (target) => target.type === "page" && isMusicUrl(target.url),
  )) {
    const { sessionId } = await bounded(
      connection.call<{ sessionId: string }>("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      }),
      signal,
      6000,
    );
    try {
      const result = await bounded(
        connection.call(
          "Runtime.evaluate",
          { expression: SIGNED_IN_SCRIPT, returnByValue: true },
          sessionId,
        ),
        signal,
        6000,
      );
      if (result.result?.value === true) return true;
    } finally {
      await connection.call("Target.detachFromTarget", { sessionId }).catch(() => undefined);
    }
  }
  return false;
}
