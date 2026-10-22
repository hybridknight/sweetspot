import { strict as assert } from "node:assert";
import { writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, ipcMain, session } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { observable } from "@trpc/server/observable";
import { router, publicProcedure } from "../src/shared/trpc/trpc";
import { signInRouter } from "../src/main/signIn/router";
import { SignInFlow } from "../src/main/signIn/flow";
import { setSignInState, clearSignInState } from "../src/main/signIn/state";
import { isTrustedTrpcSender } from "../src/main/trpc/sender";
import { loadUrlOfWebContents } from "../src/main/windows/webContentUtils";
import { googleLoginPopup } from "../src/main/windows/view";
import { verifySession, commitSession, transferSession } from "../src/main/signIn/sessionTransfer";
import { discoverBrowsers } from "../src/main/signIn/browserDiscovery";
import { signInWithBrowser } from "../src/main/signIn/browserSignIn";
import type { SignInStage } from "../src/shared/signIn";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => Promise<boolean>, ms = 6000) {
  const end = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > end) throw new Error("UI condition timed out");
    await delay(100);
  }
}

app.on("window-all-closed", () => {});
app.on("web-contents-created", (_event, contents) => {
  contents.on("console-message", (event) => {
    if (event.level === "error") console.error("Renderer:", event.message);
  });
  contents.on("preload-error", (_event, _path, error) => console.error("Preload:", error));
});
app.whenReady().then(async () => {
  const directory = process.env.SIGN_IN_CHECK_DIRECTORY!;
  if (process.env.SIGN_IN_CHECK_RESTORE === "1") {
    try {
      const cookies = await session
        .fromPartition("persist:signin-integration")
        .cookies.get({ name: "SAPISID" });
      assert.equal(cookies[0]?.value, "fixture-only");
      assert.equal(cookies[0]?.session, false);
      console.log("PASS: transferred persistent cookie survives a real Electron restart");
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
    return;
  }
  const watchdog = setTimeout(() => app.exit(1), 85000);
  try {
    ipcMain.handle("settingsProvider.getAll", () => ({}));
    const handler = createIPCHandler({
      validateSender: isTrustedTrpcSender,
      router: router({
        signIn: signInRouter,
        app: router({ onToast: publicProcedure.subscription(() => observable(() => () => {})) }),
      }),
      createContext: ({ event }: any) => ({
        event,
        getProvider: () => undefined,
        getBrowserWindow: () => BrowserWindow.fromWebContents(event.sender),
      }),
    });
    const panel = new BrowserWindow({
      width: 520,
      height: 660,
      backgroundColor: "#101014",
      webPreferences: {
        preload: join(__dirname, "../preload/api.js"),
        sandbox: false,
        contextIsolation: true,
      },
    });
    handler.attachWindow(panel);
    const flow = new SignInFlow({
      discover: async () => [],
      browser: async () => undefined,
      embedded: async () => true,
      update: () => {},
    });
    const status = (stage: SignInStage, reason?: "fallback" | "transfer") =>
      setSignInState(flow, panel.webContents.id, { id: flow.id, stage, browser: "Chrome", reason });
    status("waiting");
    await loadUrlOfWebContents(panel.webContents, "/youtube/sign-in");
    await until(() =>
      panel.webContents.executeJavaScript("document.body.innerText.includes('Continue in Chrome')"),
    );
    await writeFile(
      join(directory, "waiting.png"),
      (
        await (async () => {
          await delay(180);
          return panel.webContents.capturePage();
        })()
      ).toPNG(),
    );
    for (const [stage, reason, title] of [
      ["verifying", undefined, "Bringing your music home"],
      ["error", "fallback", "Let’s try that again"],
      ["error", "transfer", "restart Sweet Spot"],
    ] as const) {
      status(stage, reason);
      await until(() =>
        panel.webContents.executeJavaScript(
          `document.body.innerText.includes(${JSON.stringify(title)})`,
        ),
      );
      await writeFile(
        join(directory, `${stage}-${reason ?? "normal"}.png`),
        (
          await (async () => {
            await delay(180);
            return panel.webContents.capturePage();
          })()
        ).toPNG(),
      );
    }
    status("waiting");
    panel.setSize(420, 480);
    await until(() =>
      panel.webContents.executeJavaScript("document.body.innerText.includes('Continue in Chrome')"),
    );
    assert(
      await panel.webContents.executeJavaScript(
        "document.documentElement.scrollWidth <= innerWidth",
      ),
    );
    assert(
      await panel.webContents.executeJavaScript(
        "[...document.querySelectorAll('.signin-actions button')].every(button => { const box=button.getBoundingClientRect();return box.top>=0 && box.bottom<=innerHeight; })",
      ),
    );
    await writeFile(
      join(directory, "narrow.png"),
      (
        await (async () => {
          await delay(180);
          return panel.webContents.capturePage();
        })()
      ).toPNG(),
    );
    let cancelled = false;
    flow.cancel = () => {
      cancelled = true;
    };
    await panel.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(button=>button.textContent==='Cancel').click()",
    );
    await until(async () => cancelled);
    clearSignInState(flow.id);
    console.log(
      "PASS: production sign-in UI, progress states, narrow layout, and authenticated IPC cancellation",
    );

    const ses = session.fromPartition("persist:signin-integration");
    let loggedIn = true;
    await ses.protocol.handle(
      "https",
      () =>
        new Response(
          `<html><body>Music<script>globalThis.ytcfg={get:()=>${loggedIn}}</script></body></html>`,
          { headers: { "content-type": "text/html" } },
        ),
    );
    await verifySession(ses, "Mozilla/5.0", new AbortController().signal);
    const candidate = {
      url: "https://youtube.com/",
      domain: ".youtube.com",
      name: "SAPISID",
      value: "fixture-only",
      path: "/",
      secure: true,
      expirationDate: Date.now() / 1000 + 3600,
    };
    await commitSession(ses, [candidate], new AbortController().signal, () =>
      verifySession(ses, "Mozilla/5.0", new AbortController().signal),
    );
    assert.equal((await ses.cookies.get({ name: "SAPISID" }))[0].value, "fixture-only");
    await transferSession(
      [
        {
          name: "SAPISID",
          value: "fixture-only",
          domain: ".youtube.com",
          path: "/",
          secure: true,
          httpOnly: true,
          sameSite: "None",
          session: false,
          expires: Date.now() / 1000 + 3600,
        },
        {
          name: "YSC",
          value: "partition-fixture",
          domain: ".youtube.com",
          path: "/",
          secure: true,
          httpOnly: true,
          expires: -1,
          session: true,
          partitionKey: { topLevelSite: "https://youtube.com", hasCrossSiteAncestor: false },
        },
      ],
      ses,
      "Mozilla/5.0",
      new AbortController().signal,
      async (candidate, agent, signal) => {
        if (candidate === ses) candidate.protocol.unhandle("https");
        await candidate.protocol.handle(
          "https",
          () =>
            new Response(
              "<ytmusic-settings-button><img aria-hidden='true' src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==' width='24' height='24'></ytmusic-settings-button>",
              {
                headers: { "content-type": "text/html" },
              },
            ),
        );
        await verifySession(candidate, agent, signal);
      },
    );
    console.log(
      "PASS: full structured-cookie transfer through staged and destination Electron verification",
    );
    ses.protocol.unhandle("https");
    await ses.protocol.handle(
      "https",
      () =>
        new Response(`<script>globalThis.ytcfg={get:()=>${loggedIn}}</script>`, {
          headers: { "content-type": "text/html" },
        }),
    );
    loggedIn = false;
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 500);
    await assert.rejects(verifySession(ses, "Mozilla/5.0", abort.signal));
    console.log(
      "PASS: real Electron cookie insertion, flush, authenticated document verification, signed-out rejection",
    );

    status("fallback");
    const timeout = googleLoginPopup("https://music.youtube.com/", panel, {
      session: ses,
      timeoutMs: 1000,
    });
    await assert.rejects(timeout);
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    console.log("PASS: embedded fallback timeout destroys its window");
    loggedIn = true;
    assert.equal(
      await googleLoginPopup("https://music.youtube.com/", panel, {
        session: ses,
        timeoutMs: 5000,
      }),
      true,
    );
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    console.log("PASS: embedded fallback verifies actual music document and closes on success");

    if (process.env.SIGN_IN_CHECK_CHROME === "1") {
      const controller = new AbortController();
      const browsers = await discoverBrowsers(controller.signal);
      const chrome = browsers.find((browser) => browser.id === "chrome");
      assert(chrome, "Chrome must be installed for --chrome");
      let waiting = false;
      const root = join(directory, "browser-profiles");
      await assert.rejects(
        signInWithBrowser(chrome, {
          root,
          signal: controller.signal,
          onWaiting: () => {
            waiting = true;
            controller.abort();
          },
          onVerifying: () => {},
          accept: async () => {
            throw new Error("Unexpected account capture");
          },
        }),
      );
      assert(waiting, "Real Chrome must connect over CDP before cancellation");
      assert.deepEqual(await readdir(root), []);
      console.log(
        "PASS: real installed Chrome opens a fresh profile, connects, cancels, exits, and removes its profile",
      );
    }
    panel.destroy();
    clearTimeout(watchdog);
    app.exit(0);
  } catch (error) {
    console.error(error);
    for (const win of BrowserWindow.getAllWindows())
      console.error(
        "Check page:",
        win.webContents.getURL(),
        await win.webContents
          .executeJavaScript("document.body.innerText")
          .catch(() => "unavailable"),
      );
    clearTimeout(watchdog);
    app.exit(1);
  }
});
