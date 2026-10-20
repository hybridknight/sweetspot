// Isolated documentation captures: real UI components, in-memory sample data, no user profile.
import { app, BrowserWindow, ipcMain } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { initTRPC } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { BUILTIN_SKINS } from "../../src/shared/skins/builtins";
import { defaultEqSettings } from "../../src/shared/equalizer";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const t = initTRPC.create();
const q = (value: any) => t.procedure.input((v: any) => v).query(() => typeof value === "function" ? value() : value);
const mut = (value: any = null) => t.procedure.input((v: any) => v).mutation(() => value);
const sub = () => t.procedure.subscription(() => observable<any>(() => () => {}));
const settings: Record<string, any> = {
  equalizer: { ...defaultEqSettings(), enabled: true },
  "lyrics.enabled": true,
  "lyrics.lineStyle": "fill",
  "themes.enabled": true,
  "themes.selected": "default",
  "themes.thumbnailBackground": true,
  "player.stableVolumeEnabled": true,
  "player.playbackTransitions": { smoothPlayPause: true, songFades: true, songFadeSeconds: 1 },
  "api.enabled": false,
};
let selected = BUILTIN_SKINS[0].id;
const showcase = process.env.DOCS_CAPTURE_SHOWCASE === "true";
// Official video references: youtube.com/watch?v=<videoId>. Only used for promotional captures.
const showcaseTracks = [
  { title: "BIRDS OF A FEATHER", artist: "Billie Eilish", videoId: "V9PVRfjEBTI", duration: 210 },
  { title: "Blinding Lights", artist: "The Weeknd", videoId: "4NRXx6U8ABQ", duration: 200 },
  { title: "Levitating (feat. DaBaby)", artist: "Dua Lipa", videoId: "TUVcZfQe-Kw", duration: 203 },
];
const showcaseIndex = () => selected === "builtin-studio" ? 1 : selected === "builtin-pop" ? 2 : 0;
const currentShowcaseTrack = () => showcaseTracks[showcaseIndex()];
const artwork = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
const catalog = () => ({ builtins: BUILTIN_SKINS, custom: [], selected, preferences: {} });
const r = t.router({
  settings: t.router({
    get: t.procedure
      .input((v: any) => v)
      .query(({ input }) => settings[input.key] ?? input.defaultValue),
    update: mut(),
    onChange: sub(),
  }),
  player: t.router({
    catalog: t.procedure.query(catalog),
    onCatalog: sub(),
    onPreview: sub(),
    spectrum: sub(),
    artistArtwork: q(() => showcase ? artwork(currentShowcaseTrack().videoId) : null),
    queue: q(() => showcase ? {
      count: 3,
      items: showcaseTracks.map((_, index) => {
        const track = showcaseTracks[(showcaseIndex() + index) % showcaseTracks.length];
        return { ...track, id: track.videoId, index, current: index === 0, thumbnail: artwork(track.videoId),
          duration: `${Math.floor(track.duration / 60)}:${String(track.duration % 60).padStart(2, "0")}`, revision: "showcase" };
      }),
      revision: "showcase",
    } : {
      count: 4,
      items: ["Sample track", "Evening light", "A quiet moment", "Home again"].map(
        (title, index) => ({
          id: "sample-" + index,
          videoId: index ? "sample-" + index : "sample",
          index,
          title,
          artist: "Sample artist",
          duration: "4:00",
          current: index === 0,
          revision: "sample",
        }),
      ),
      revision: "sample",
    }),
    mode: q(true),
    onMode: sub(),
    videoDimensions: q(null),
    ...Object.fromEntries(
      [
        "select",
        "removeSkin",
        "previewPreferences",
        "enter",
        "transparency",
        "openAppearance",
        "videoMode",
        "resizeHeight",
        "preferences",
        "fullMode",
        "pin",
        "minimize",
        "moveQueue",
        "queueAction",
        "playQueue",
        "minimumHeight",
        "videoBounds",
      ].map((k) => [k, mut()]),
    ),
  }),
  equalizer: t.router({
    status: q({ state: "enabled", message: "Equalizer active", sampleRate: 48000, headroomDb: 0 }),
    ...Object.fromEntries(
      ["commit", "preview", "savePreset", "renamePreset", "deletePreset"].map((k) => [
        k,
        mut(settings.equalizer),
      ]),
    ),
  }),
  themes: t.router({
    list: q([
      { id: "default", name: "Default" },
      { id: "custom", name: "Custom" },
    ]),
    reload: mut(),
  }),
  trayView: t.router({
    pinned: q(false),
    onState: sub(),
    hide: mut(),
    openMain: mut(),
    togglePinned: mut(),
  }),
  api: t.router({ status: q({ enabled: false, running: false, port: 13091 }) }),
  auth: t.router({
    status: q({ authRequired: false, clients: [], pending: [] }),
    revealToken: mut(""),
    onPending: sub(),
    onClients: sub(),
    approve: mut(),
    deny: mut(),
    revoke: mut(),
    revokeAll: mut(),
    create: mut(),
  }),
  track: t.router({
    current: q(() => showcase ? {
      video: { videoId: currentShowcaseTrack().videoId, title: currentShowcaseTrack().title, author: currentShowcaseTrack().artist },
      meta: { duration: currentShowcaseTrack().duration, isAudioExclusive: true, thumbnail: artwork(currentShowcaseTrack().videoId) },
    } : {
      video: { videoId: "sample", title: "Sample track", author: "Sample artist" },
      meta: { duration: 240, isAudioExclusive: true, thumbnail: null },
    }),
    state: q(() => showcase ? { id: currentShowcaseTrack().videoId, playing: false, progress: 42, duration: currentShowcaseTrack().duration, percentage: 20 }
      : { id: "sample", playing: false, progress: 72, duration: 240, percentage: 30 }),
    onTrack: sub(),
    onPlayState: sub(),
    ...Object.fromEntries(
      ["togglePlay", "next", "prev", "seek", "shuffle", "repeat"].map((k) => [k, mut()]),
    ),
    volume: mut({ volume: 65 }),
  }),
  app: t.router({ openFile: mut(null), openSettings: mut(), onToast: sub() }),
});
app.setName("Sweet Spot documentation capture");
app.setPath("userData", join(__dirname, "profile"));
app.commandLine.appendSwitch("use-mock-keychain");
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 1000,
    show: false,
    webPreferences: { preload: join(__dirname, "preload.js"), sandbox: true, offscreen: true },
  });
  const handler = createIPCHandler({ router: r, windows: [win] });
  handler.attachWindow(win);
  const output = process.env.DOCS_CAPTURE_OUTPUT!;
  mkdirSync(output, { recursive: true });
  try {
    for (const screen of [
      "skins",
      "equalizer",
      "playback",
      "lyrics",
      "themes",
      "display",
      "generic",
      "api",
      "authentication",
      "tray",
      ...BUILTIN_SKINS.map((s) => "player-" + s.id.replace("builtin-", "")),
    ]) {
      if (showcase && !["player-spotlight", "player-studio", "player-pop"].includes(screen)) continue;
      if (process.env.DOCS_CAPTURE_ONLY && !screen.startsWith(process.env.DOCS_CAPTURE_ONLY))
        continue;
      if (screen.startsWith("player-")) {
        selected = "builtin-" + screen.slice(7);
        win.setContentSize(BUILTIN_SKINS.find((s) => s.id === selected)!.layout.width, 750);
      }
      if (screen === "tray") win.setContentSize(520, 240);
      let errors: string[] = [];
      const listener = (_event: any, _level: any, message: any) => {
        const msg = typeof _event === "object" && _event.message ? _event.message : message;
        if (String(msg).includes("Error")) errors.push(String(msg));
      };
      win.webContents.on("console-message", listener);
      await win.loadFile(join(__dirname, "renderer/index.html"), {
        query: { screen: screen.startsWith("player-") ? "player" : screen },
      });
      await new Promise((r) => setTimeout(r, 1500));
      await win.webContents.executeJavaScript("document.fonts.ready");
      if (showcase) {
        await win.webContents.insertCSS(`
          .studio-chrome, .module-transport > .module-title { display: none !important; }
          .media-tabs > span:first-child { display: none !important; }
        `);
        await win.webContents.executeJavaScript(`Promise.all(Array.from(document.images, image => image.decode().catch(() => {})))`);
      }
      const metrics = await win.webContents.executeJavaScript(
        "({height:Math.ceil(document.querySelector('main')?.getBoundingClientRect().height ?? document.documentElement.scrollHeight),text:document.body.innerText})",
      );
      if (!metrics.text.trim() || errors.length)
        throw new Error(screen + ": " + errors.join("; ") + " " + metrics.text.slice(0, 200));
      // Full page keeps all real settings visible rather than cropping controls.
      if (!showcase) writeFileSync(
        join(output, screen + "-preview.png"),
        (await win.webContents.capturePage()).toPNG(),
      );
      win.setContentSize(
        screen.startsWith("player-")
          ? BUILTIN_SKINS.find((s) => s.id === selected)!.layout.width
          : screen === "tray"
            ? 520
            : 1200,
        Math.min(5000, Math.max(200, metrics.height)),
      );
      await new Promise((r) => setTimeout(r, 250));
      writeFileSync(join(output, screen + ".png"), (await win.webContents.capturePage()).toPNG());
      console.log("Captured", screen, metrics.text.slice(0, 70).replace(/\n/g, " "));
      win.webContents.removeListener("console-message", listener);
      win.setContentSize(1200, 1000);
    }
    handler.detachWindow(win);
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
