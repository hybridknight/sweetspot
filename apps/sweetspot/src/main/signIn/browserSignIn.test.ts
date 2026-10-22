import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEndpoint, signInWithBrowser, sweepProfiles } from "./browserSignIn";
import { browserCookies } from "./cookies";

const directories: string[] = [];
const require = createRequire(import.meta.url);
async function fixture(mode = "success") {
  const directory = await mkdtemp(join(tmpdir(), "sweetspot-browser-test-"));
  directories.push(directory);
  const executable = join(directory, "fake-browser");
  await writeFile(
    executable,
    `#!${process.execPath}
process.on('uncaughtException', error => { require('node:fs').writeFileSync(${JSON.stringify(join(directory, "failure"))}, String(error.stack)); process.exit(1); });
const fs = require('node:fs'), path = require('node:path'), { WebSocketServer } = require(${JSON.stringify(require.resolve("ws"))});
const profile = process.argv.find(arg => arg.startsWith('--user-data-dir=')).split('=').slice(1).join('=');
if (${JSON.stringify(mode)} === 'crash') process.exit(1);
const server = new WebSocketServer({host:'127.0.0.1', port:0});
server.on('listening', () => fs.writeFileSync(path.join(profile,'DevToolsActivePort'), server.address().port+'\\n/devtools/browser/test-browser'));
server.on('connection', socket => socket.on('message', raw => {
 const request = JSON.parse(raw); let result = {};
 if(request.method==='Browser.close') { socket.send(JSON.stringify({id:request.id,result:{}}), () => process.exit(0)); return; }
 if(request.method==='Storage.getCookies') result={cookies:[{name:'SAPISID',value:'fixture-only',domain:'.youtube.com',path:'/',secure:true,httpOnly:true,expires:Date.now()/1000+3600,session:false}, ...(${JSON.stringify(mode)}==='avatar-partitioned'?[{name:'YSC',value:'partitioned-fixture',domain:'.youtube.com',path:'/',secure:true,httpOnly:true,expires:-1,session:true,partitionKey:{topLevelSite:'https://youtube.com',hasCrossSiteAncestor:false}}]:[])]};
 if(request.method==='Target.getTargets') result={targetInfos:[{type:'page',url:${JSON.stringify(mode === "rejected" ? "https://accounts.google.com/signin/v2/deniedsigninrejected" : "https://music.youtube.com/")},targetId:'music'}]};
 if(request.method==='Target.attachToTarget') result={sessionId:'music-session'};
 if(request.method==='Runtime.evaluate') result={result:{value:require('node:vm').runInNewContext(request.params.expression,{
  location:{protocol:'https:',hostname:'music.youtube.com'},
  ytcfg: ${JSON.stringify(mode)}==='avatar-partitioned'?undefined:{get:()=>true},
  document:{querySelector:()=>${JSON.stringify(mode)}==='avatar-partitioned'?{closest:()=>null,getClientRects:()=>[{}]}:null}
})}};
 socket.send(JSON.stringify({id:request.id,result}));
}));
`,
    { mode: 0o700 },
  );
  return {
    directory,
    root: join(directory, "profiles"),
    browser: { id: "chrome" as const, name: "Chrome", executable },
  };
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe("owned browser lifecycle", () => {
  it.each([
    "0\n/devtools/browser/test",
    "65536\n/devtools/browser/test",
    "abc\n/devtools/browser/test",
    "9999\nhttps://evil.test/",
    "9999\n/devtools/page/test",
  ])("rejects malformed endpoint %s", (text) => expect(() => parseEndpoint(text)).toThrow());
  it("accepts a loopback browser endpoint with CRLF", () =>
    expect(parseEndpoint("54321\r\n/devtools/browser/test-browser\r\n")).toBe(
      "ws://127.0.0.1:54321/devtools/browser/test-browser",
    ));
  it.skipIf(process.platform === "win32")(
    "captures only after verified music state, exits before transfer, and deletes profile",
    async () => {
      const { browser, root } = await fixture();
      const accept = vi.fn(async () => {
        expect(await readdir(root)).toEqual([]);
      });
      await signInWithBrowser(browser, {
        root,
        signal: new AbortController().signal,
        onWaiting: vi.fn(),
        onVerifying: vi.fn(),
        accept,
      }).catch(async (error) => {
        throw new Error(
          await readFile(join(root, "..", "failure"), "utf8").catch(() => String(error)),
        );
      });
      expect(accept).toHaveBeenCalledTimes(1);
      expect(accept.mock.calls[0]).toBeDefined();
    },
    12_000,
  );
  it.skipIf(process.platform === "win32")(
    "finishes a signed-in page with no config flag and optional partitioned cookies",
    async () => {
      const { browser, root } = await fixture("avatar-partitioned");
      const verifying = vi.fn();
      const accept = vi.fn(async (cookies) => {
        expect(browserCookies(cookies).map((cookie) => cookie.name)).toEqual(["SAPISID"]);
      });
      await signInWithBrowser(browser, {
        root,
        signal: new AbortController().signal,
        onWaiting: vi.fn(),
        onVerifying: verifying,
        accept,
      });
      expect(verifying).toHaveBeenCalledOnce();
      expect(accept).toHaveBeenCalledOnce();
      expect(await readdir(root)).toEqual([]);
    },
    12000,
  );
  it.skipIf(process.platform === "win32")(
    "cancels a visible attempt and cleans up before rejecting",
    async () => {
      const { browser, root } = await fixture();
      const controller = new AbortController();
      const accept = vi.fn();
      await expect(
        signInWithBrowser(browser, {
          root,
          signal: controller.signal,
          onWaiting: () => controller.abort(),
          onVerifying: vi.fn(),
          accept,
        }),
      ).rejects.toThrow();
      expect(accept).not.toHaveBeenCalled();
      expect(await readdir(root)).toEqual([]);
    },
  );
  it.skipIf(process.platform === "win32")(
    "handles an early process crash without hanging or leaking a profile",
    async () => {
      const { browser, root } = await fixture("crash");
      await expect(
        signInWithBrowser(browser, {
          root,
          signal: new AbortController().signal,
          onWaiting: vi.fn(),
          onVerifying: vi.fn(),
          accept: vi.fn(),
        }),
      ).rejects.toMatchObject({ code: "browser" });
      expect(await readdir(root)).toEqual([]);
    },
  );
  it.skipIf(process.platform === "win32")(
    "falls back promptly on Google's browser rejection page",
    async () => {
      const { browser, root } = await fixture("rejected");
      const waiting = vi.fn();
      await expect(
        signInWithBrowser(browser, {
          root,
          signal: new AbortController().signal,
          onWaiting: waiting,
          onVerifying: vi.fn(),
          accept: vi.fn(),
        }),
      ).rejects.toMatchObject({ code: "browser" });
      expect(waiting).toHaveBeenCalledOnce();
      expect(await readdir(root)).toEqual([]);
    },
  );
  it.skipIf(process.platform === "win32")(
    "bounds interactive sign-in time and cleans the profile",
    async () => {
      const { browser, root } = await fixture();
      await expect(
        signInWithBrowser(browser, {
          root,
          signal: new AbortController().signal,
          timeoutMs: 50,
          onWaiting: vi.fn(),
          onVerifying: vi.fn(),
          accept: vi.fn(),
        }),
      ).rejects.toMatchObject({ code: "timeout" });
      expect(await readdir(root)).toEqual([]);
    },
  );
  it("cleans up spawn failure", async () => {
    const { browser, root } = await fixture();
    browser.executable += "-missing";
    await expect(
      signInWithBrowser(browser, {
        root,
        signal: new AbortController().signal,
        onWaiting: vi.fn(),
        onVerifying: vi.fn(),
        accept: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "browser" });
    expect(await readdir(root)).toEqual([]);
  });
  it("sweeps only marked, inactive directories and never follows directory symlinks", async () => {
    const { directory, root } = await fixture();
    await mkdir(root);
    const stale = join(root, "attempt-stale");
    await mkdir(stale);
    await writeFile(
      join(stale, "sweetspot-owner.json"),
      JSON.stringify({ kind: "sweetspot-sign-in-v1", appPid: 2147483647 }),
    );
    const active = join(root, "attempt-active");
    await mkdir(active);
    await writeFile(
      join(active, "sweetspot-owner.json"),
      JSON.stringify({ kind: "sweetspot-sign-in-v1", appPid: process.pid }),
    );
    await mkdir(join(root, "attempt-unmarked"));
    if (process.platform !== "win32") {
      const locked = join(root, "attempt-deadlock");
      await mkdir(locked);
      await writeFile(
        join(locked, "sweetspot-owner.json"),
        JSON.stringify({ kind: "sweetspot-sign-in-v1", appPid: 2147483647 }),
      );
      await symlink("test-host-2147483647", join(locked, "SingletonLock"));
    }

    if (process.platform !== "win32") await symlink(directory, join(root, "attempt-symlink"));
    await sweepProfiles(root);
    const entries = await readdir(root);
    expect(entries).not.toContain("attempt-deadlock");
    expect(entries).not.toContain("attempt-stale");
    expect(entries).toContain("attempt-active");
    expect(entries).toContain("attempt-unmarked");
    if (process.platform !== "win32") expect(entries).toContain("attempt-symlink");
  });
});
