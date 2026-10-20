import { navigateSettingsWindow, showIndependentSettingsWindow } from "../src/main/windows/settingsWindow";
import { app, BrowserWindow, WebContentsView, ipcMain, Menu, screen } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { isTrustedTrpcSender } from "../src/main/trpc/sender";
import { pathToFileURL } from "node:url";
import { router, publicProcedure } from "../src/shared/trpc/trpc";
import { observable } from "@trpc/server/observable";
import { playerRouter } from "../src/main/player/router";
import { settingsRouter } from "../src/main/trpc/routers/settings/router";
import { equalizerRouter } from "../src/main/trpc/routers/equalizer/router";
import { authorizePlayer } from "../src/main/player/access";
import { configurePlayerMode, playerMode } from "../src/main/player/mode";
import { videoFullscreenPreferences } from "../src/main/player/video-preferences";
import { SkinWindowSizes } from "../src/main/player/window-sizes";
import { defaultEqSettings } from "../src/shared/equalizer";
import { BUILTIN_SKINS } from "../src/shared/skins/builtins";
import { settingDefaults } from "../src/shared/skins/schema";
import { fixture } from "./player-test-ytm";
import { Subject } from "rxjs";
import { z } from "zod";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));
async function capturePlayerPage(contents: Electron.WebContents) {
  for (let attempt = 0; ; attempt++) {
    try { return await contents.capturePage(); }
    catch (error) {
      // Chromium can briefly lack a compositor surface immediately after a view reload.
      if (attempt >= 2 || !String(error).includes("UnknownVizError")) throw error;
      await delay(150);
    }
  }
}

app.on("web-contents-created", (_event, wc) => {
  wc.on("console-message", (event) => {
    if (event.level === "error") console.error("Renderer:", event.message);
  });
  wc.on("preload-error", (_ev, path, error) => console.error("Preload:", path, error));
});
app.whenReady().then(async () => {
  const directory = join(__dirname, "..");

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    frame: false,
    transparent: process.platform === "darwin",
    visualEffectState: "active",
    backgroundColor: "#030404",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
    webPreferences: { sandbox: true, nodeIntegration: false },
  });
  const backgroundWrites: string[] = [];
  const nativeBackground = win.setBackgroundColor.bind(win);
  win.setBackgroundColor = (color: string) => { backgroundWrites.push(color); nativeBackground(color); };
  const vibrancyWrites: (string | null)[] = [];
  if (process.platform === 'darwin') {
    const nativeVibrancy = win.setVibrancy.bind(win);
    win.setVibrancy = (type, options) => { vibrancyWrites.push(type); nativeVibrancy(type, options); };
  }
  const buttonVisibility: boolean[] = [];
  if (process.platform === "darwin") {
    const setVisibility = win.setWindowButtonVisibility.bind(win);
    win.setWindowButtonVisibility = (visible) => {
      buttonVisibility.push(visible);
      setVisibility(visible);
    };
  }
  const youtube = new WebContentsView({ webPreferences: { backgroundThrottling: false, ...videoFullscreenPreferences } }),
    toolbar = new WebContentsView();
  win.contentView.addChildView(youtube);
  win.contentView.addChildView(toolbar);
  await youtube.webContents.loadURL(
    "data:text/html," +
      encodeURIComponent(
        "<html><body><div>Library</div><style>#song-video{display:none!important} #player-page{visibility:hidden} #player{overflow:auto}</style><ytmusic-player-page id='player-page'><div id='player'><div id='song-video'><div id='movie_player'><video></video></div></div></div></ytmusic-player-page><ytmusic-av-toggle><button class='song-button' aria-pressed='true'>Song</button><button class='video-button' aria-pressed='false'>Video</button></ytmusic-av-toggle></body></html>",
      ),
  );
  if (process.env.PLAYER_TEST_VIDEO_CONTROLS_ONLY === "1") {
    // Match YouTube's HTML security policy: controls must not use string HTML sinks.
    await youtube.webContents.executeJavaScript(`(() => {
      const policy = document.createElement('meta');
      policy.httpEquiv = 'Content-Security-Policy';
      policy.content = "require-trusted-types-for 'script'";
      document.head.append(policy);
      let enforced = false;
      try { document.createElement('div').innerHTML = '<span>blocked</span>'; }
      catch { enforced = true; }
      if (!enforced) throw new Error('Trusted Types fixture policy was not enforced');
    })()`);
  }
  fixture.page = youtube.webContents;
  await youtube.webContents.executeJavaScript(
    readFileSync(join(directory, "renderer/test-page.js"), "utf8"),
  );
  await youtube.webContents.executeJavaScript(
    `(() => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    window.nativeTestCanvas = canvas;
    const ctx = canvas.getContext('2d'); let frame = 0;
    setInterval(() => { ctx.fillStyle = '#17304c'; ctx.fillRect(0,0,320,180); ctx.fillStyle = '#aac5e2'; ctx.fillRect((frame++ % 280),70,40,40); }, 80);
    const video = document.querySelector('video'); video.muted = true; video.srcObject = canvas.captureStream(12);
    window.nativeTestVideo = video; return video.play();
  })()`,
    true,
  );
  // Mirrors the legacy music view's parent-size listener. Player layout must win afterwards.
  win.on("show", () => youtube.setBounds({ x: 0, y: 40, width: 1100, height: 720 }));
  let fullLayouts = 0;
  const data: Record<string, unknown> = { equalizer: defaultEqSettings() };
  const settings = {
    get: (k: string) => data[k],
    set(k: string, v: unknown) {
      const prevValue = data[k];
      data[k] = v;
      this.settingChanged.next({ key: k, value: v, prevValue });
    },
    saveToDrive() {},
    settingChanged: new Subject<any>(),
  };
  configurePlayerMode(win, youtube, toolbar, () => {
    fullLayouts++;
    youtube.setBounds({ x: 0, y: 40, width: 1100, height: 720 });
  }, process.env.PLAYER_TEST_VIDEO_ONLY === "1" ? () => {
    const skin = BUILTIN_SKINS.find(skin => skin.id === (data.playerSkins as any)?.selected) ?? BUILTIN_SKINS[0];
    return { id: skin.id, width: skin.layout.width };
  } : undefined, process.env.PLAYER_TEST_VIDEO_ONLY === "1" ? new SkinWindowSizes(settings) : undefined);
  const subscriptions = () => observable<any>(() => () => {});
  const playStates = new Subject<any>();
  const trackUpdates = new Subject<any>();
  const track = router({
    current: publicProcedure.query(() => ({
      video: { videoId: "a", title: "After the Rain", author: "Northbound" },
      meta: { isAudioExclusive: true, counterpartVideoId: "video-a", duration: 266, thumbnail: "https://i.ytimg.com/test-art.png" },
    })),
    state: publicProcedure.query(() => ({
      id: "a",
      playing: fixture.playing,
      progress: fixture.progress,
      duration: 266,
    })),
    onTrack: publicProcedure.subscription(() => observable<any>((emit) => {
      const sub = trackUpdates.subscribe(value => emit.next(value));
      return () => sub.unsubscribe();
    })),
    onPlayState: publicProcedure.subscription(() => observable<any>((emit) => {
      const subscription = playStates.subscribe((state) => emit.next(state));
      return () => subscription.unsubscribe();
    })),
    volume: publicProcedure
      .input(z.object({ volume: z.number().optional() }).optional())
      .mutation(({ input }) => {
        if (input?.volume !== undefined) fixture.volume = input.volume;
        return { volume: fixture.volume };
      }),
    togglePlay: publicProcedure.mutation(() => {
      fixture.playing = !fixture.playing;
      playStates.next({ id: "a", playing: fixture.playing, progress: fixture.progress, duration: 266 });
    }),
    next: publicProcedure.mutation(() => {}),
    prev: publicProcedure.mutation(() => {}),
    repeat: publicProcedure.mutation(() => {}),
    shuffle: publicProcedure.mutation(() => {}),
    seek: publicProcedure
      .input(z.object({ time: z.number(), type: z.string().optional() }))
      .mutation(({ input }) => {
        fixture.progress = input.time / 1000;
      }),
  });
  if (process.env.PLAYER_TEST_MODE_ENTRY_ONLY === "1") {
    const catalog = playerRouter._def.procedures.catalog;
    playerRouter._def.procedures.catalog = Object.assign(async (...args: Parameters<typeof catalog>) => {
      await delay(300);
      return catalog(...args);
    }, catalog);
  }
  const handler = createIPCHandler({
    validateSender: (event: Electron.IpcMainEvent) => isTrustedTrpcSender(event) || (
      event.senderFrame === event.sender.mainFrame &&
      event.senderFrame?.url.split("#")[0] === pathToFileURL(join(directory, "renderer/appearance.html")).href
    ),
    router: router({
      player: playerRouter,
      settings: settingsRouter,
      equalizer: equalizerRouter,
      track,
      app: router({ onToast: publicProcedure.subscription(subscriptions) }),
    }),
    createContext: async ({ event }: any) => ({
      event,
      getProvider: () => settings,
      getBrowserWindow: () => win,
      authorizeProcedure: (path: string) => authorizePlayer(event.sender, path),
    }),
  } as any);
  handler.attachWindow(win);
  const timeout = setTimeout(() => {
    console.error("Player integration timed out");
    app.exit(1);
  }, 85000);
  try {
    const bounds = win.getBounds();
    const originalWindowBackground = win.getBackgroundColor();
    // The tray is trusted UI: its query and replaying subscription follow native menu changes too.
    const trayCaller = playerRouter.createCaller({ getProvider: () => settings } as any);
    const trayModes: boolean[] = [];
    const trayModeSubscription = (await trayCaller.onMode()).subscribe({
      next: (active) => trayModes.push(active),
    });
    assert.equal(await trayCaller.mode(), false);
    assert.deepEqual(trayModes, [false]);
    if (process.env.PLAYER_TEST_VIDEO_ONLY === "1") youtube.webContents.openDevTools({ mode: "detach" });
    if (process.env.PLAYER_TEST_MODE_ENTRY_ONLY === "1") {
      await youtube.webContents.executeJavaScript("window.autoPlayOnModeSwitch=true;window.pauseOnModeSwitch=true;window.modeSwitchDelay=650");
    }
    await trayCaller.enter();
    if (process.env.PLAYER_TEST_VIDEO_ONLY === "1") assert.equal(youtube.webContents.isDevToolsOpened(), false, "Native video DevTools can show a viewport-size overlay in player mode");
    assert.equal(await trayCaller.mode(), true);
    assert.deepEqual(trayModes, [false, true]);
    const view = win.contentView.children.find(
      (v: any) => v.webContents?.id === playerMode().senderId,
    ) as WebContentsView;
    const wc = view.webContents;
    await wc.session.protocol.handle("https", () => new Response(Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j2E0AAAAASUVORK5CYII=", "base64"),
      { headers: { "Content-Type": "image/png" } }));
    const execute = async (code: string) => {
      try { return await wc.executeJavaScript(code, true); }
      catch (error) { throw new Error(`Player expression failed: ${code}`, { cause: error }); }
    };
    async function waitFor(expression: string) {
      for (let i = 0; i < 80; i++) {
        if (await execute(expression)) return;
        await delay(100);
      }
      console.error(await execute("document.body.innerText"));
      throw new Error(`Timed out: ${expression}`);
    }
    const selectMediaView = async (view: "artwork" | "video") => {
      await execute(`(() => {
        const toggle = document.querySelector('button[aria-label="Artwork or video"]');
        if (toggle) {
          if (document.querySelector('.module-media .media-tabs')) throw new Error('Media view buttons duplicate the transport switch');
          if ((toggle.getAttribute('aria-pressed') === 'true') !== ${view === "video"}) toggle.click();
        } else {
          document.querySelector('.media-tabs button[aria-label="${view === "video" ? "Video" : "Artwork"}"]').click();
        }
      })()`);
      await delay(200);
    };
    const click = async (label: string) => {
      await execute(`document.querySelector('button[aria-label="${label}"]').click()`);
      await delay(200);
    };
    await waitFor(
      "!!document.querySelector('.track-display h1') && document.querySelector('.track-display h1').textContent==='After the Rain'",
    );
    if (process.env.PLAYER_TEST_PLAYLIST_CONTEXT_ONLY === "1") {
      await waitFor("document.querySelector('.studio-playlist-header h2')?.textContent === 'Northbound Favorites'");
      await execute("document.querySelector('.queue-list li:nth-child(2) .queue-play').click()");
      await waitFor("document.querySelector('.queue-list li:nth-child(2) .queue-play')?.getAttribute('aria-current') === 'true'");
      assert.equal(await execute("document.querySelector('.studio-playlist-header h2').textContent"), "Northbound Favorites");
      for (const id of ["builtin-studio", "builtin-spotlight"]) {
        await trayCaller.select(id);
        await waitFor("document.querySelector('.studio-playlist-header h2')?.textContent === 'Northbound Favorites'");
      }
      await youtube.webContents.executeJavaScript("testPlayer.setPlaylistTitle(null)");
      await waitFor("document.querySelector('.studio-playlist-header h2')?.textContent === 'Northbound'");
      await youtube.webContents.executeJavaScript("testPlayer.setPlaylistTitle('Late Night Favorites')");
      await waitFor("document.querySelector('.studio-playlist-header h2')?.textContent === 'Late Night Favorites'");
      console.log("PASS: player mode keeps the playing playlist title on entry, song/skin changes and playlist changes; missing playlist metadata falls back to the artist.");
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_TOOLTIPS_ONLY === "1") {
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        assert.equal(await execute("document.querySelectorAll('.skinned-player [title]').length"), 0, `${skin.name} still uses native tooltips`);
        win.focus();
        const point = await execute(`(() => {
          const button = document.querySelector('button[aria-label="Next track"]');
          const rect = button.getBoundingClientRect();
          return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
        })()`);
        wc.sendInputEvent({ type: "mouseMove", x: 1, y: 1 });
        wc.sendInputEvent({ type: "mouseMove", ...point });
        await delay(150);
        assert.equal(await execute("!!document.querySelector('[role=tooltip]')?.textContent.includes('Next track')"), false, "Playback tooltip appeared before its hover delay");
        await waitFor("document.querySelector('[role=tooltip]')?.textContent.includes('Next track')");
        const tooltip = await execute(`(() => {
          const tip = document.querySelector('[role=tooltip]'), rect = tip.getBoundingClientRect();
          return { text: tip.textContent, size: parseFloat(getComputedStyle(tip).fontSize), fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight };
        })()`);
        assert.ok(tooltip.size >= 14 && tooltip.fits, `${skin.name} tooltip is too small or clipped: ${JSON.stringify(tooltip)}`);
        if (["album", "spotlight"].includes(skin.layout.arrangement)) {
          assert.ok(tooltip.text.includes(process.platform === "darwin" ? "⌥→" : "Alt+ArrowRight"), "Tooltip uses the wrong platform shortcut");
        }
        if (skin.id === "builtin-spotlight") writeFileSync('/private/tmp/player-custom-tooltip.png', (await capturePlayerPage(wc)).toPNG());
        wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await waitFor("!document.querySelector('[role=tooltip]')");
        wc.sendInputEvent({ type: "mouseMove", x: 1, y: 1 });
        wc.focus();
        await execute(`document.querySelector('button[aria-label="Always on top"]').focus()`);
        wc.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
        await waitFor("document.querySelector('[role=tooltip]')?.textContent.includes('Skin settings')");
        wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await waitFor("!document.querySelector('[role=tooltip]')");
        await execute("document.querySelector('.queue-menu-trigger').click()");
        await waitFor("!!document.querySelector('.queue-song-menu')");
        wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await waitFor("!document.querySelector('.queue-song-menu')");
        // Closing a menu restores keyboard focus to its tooltip trigger.
        await delay(100);
        wc.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        wc.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
        await waitFor("!document.querySelector('[role=tooltip]')");
      }
      await trayCaller.select("builtin-spotlight");
      await waitFor("document.querySelector('.skinned-player')?.dataset.arrangement === 'spotlight'");
      await selectMediaView("video");
      await waitFor("!!document.querySelector('.native-video')");
      const nativeTooltip = await youtube.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('[data-sweetspot-video-controls] button');
        button.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
        const tip = document.getElementById(button.getAttribute('aria-describedby'));
        return { title: button.getAttribute('title'), text: tip.textContent, display: getComputedStyle(tip).display, size: parseFloat(getComputedStyle(tip).fontSize) };
      })()`);
      assert.deepEqual(nativeTooltip, { title: null, text: "Enter fullscreen", display: "block", size: 14 });
      youtube.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
      youtube.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      await delay(100);
      assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls] [role=tooltip]')).display"), "none");
      console.log("PASS: custom tooltips support hover, focus, Escape, readable sizing, viewport placement and platform shortcuts across all seven skins; queue actions still open; native fullscreen control uses a custom tooltip.");
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_MODE_ENTRY_ONLY === "1") {
      await delay(1200);
      assert.equal(await youtube.webContents.executeJavaScript("document.querySelector('video').paused"), false, `Entering the player stopped the playing song; mode requests: ${JSON.stringify(fixture.videoModeRequests)}`);
      assert.ok(fixture.videoModeRequests.every(enabled => !enabled), `Loading fallback switched to Video before Spotlight artwork loaded: ${JSON.stringify(fixture.videoModeRequests)}`);
      for (const skin of BUILTIN_SKINS) {
        for (const playing of [true, false]) {
          await trayCaller.fullMode();
          await trayCaller.select(skin.id);
          await youtube.webContents.executeJavaScript(`testPlayer.cancelSkinVideoModePause(); ${playing ? "document.querySelector('video').play()" : "document.querySelector('video').pause()"}`);
          fixture.videoModeRequests = [];
          const loaded = new Promise<void>(resolve => wc.once("did-finish-load", () => resolve()));
          wc.reload();
          await loaded;
          await trayCaller.enter();
          await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)}) && !!document.querySelector('.track-display h1')`);
          await delay(1200);
          assert.equal(await youtube.webContents.executeJavaScript("document.querySelector('video').paused"), !playing, `${skin.name} entry changed playback (playing=${playing}); requests: ${JSON.stringify(fixture.videoModeRequests)}`);
          assert.ok(fixture.videoModeRequests.length > 0 && fixture.videoModeRequests.every(mode => mode === fixture.videoModeRequests[0]), `${skin.name} initialization changed media modes while loading: ${JSON.stringify(fixture.videoModeRequests)}`);
        }
      }
      console.log("PASS: cold entry with delayed skin loading preserves playing and paused songs across all seven skins, without transient mode switches.");
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_VIDEO_POSITION_ONLY === "1") {
      const checkPosition = async (label: string) => {
        let lastState: unknown;
        for (let attempt = 0; attempt < 60; attempt++) {
          const native = youtube.getBounds();
          const state = await execute(`(() => {
            const v=${JSON.stringify(native)};
            const r=document.querySelector('.player-media').getBoundingClientRect();
            const c=document.querySelector('.module-media .module-content').getBoundingClientRect();
            const artist=document.querySelector('.module-media .studio-artist')?.getBoundingClientRect();
            const tabs=document.querySelector('.module-media .media-tabs');
            const title=document.querySelector('.module-media .module-title').getBoundingClientRect();
            const controls=Math.max(title.bottom,tabs ? tabs.getBoundingClientRect().bottom+parseFloat(getComputedStyle(tabs).marginBottom) : 0);
            const x=Math.max(r.left,c.left,0),right=Math.min(r.right,c.right,innerWidth);
            let y=Math.max(r.top,c.top,controls,0),bottom=Math.min(r.bottom,c.bottom,artist?.height>0?artist.top:innerHeight,innerHeight);
            for(const e of document.querySelectorAll('.module-transport .transport-row,.module-transport .secondary-controls')) {
              const b=e.getBoundingClientRect();
              if(!b.width||!b.height||b.right<=x||b.left>=right||b.bottom<=y||b.top>=bottom)continue;
              if((b.top+b.bottom)/2<=(y+bottom)/2)y=Math.max(y,b.bottom+8);else bottom=Math.min(bottom,b.top-8);
            }
            const region={x,y,width:right-x,height:bottom-y};
            const overlap=[...document.querySelectorAll('.media-tabs button,.skin-icon')].filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&Math.min(b.right,v.x+v.width)-Math.max(b.left,v.x)>1&&Math.min(b.bottom,v.y+v.height)-Math.max(b.top,v.y)>1}).map(e=>({label:e.getAttribute('aria-label'),rect:e.getBoundingClientRect().toJSON()}));
            return {region,overlap};
          })()`);
          lastState={native,...state};
          if (['x','y','width','height'].every(key=>Math.abs(native[key]-state.region[key])<=1) && state.overlap.length===0 && youtube.getVisible() && native.width>0 && native.height>0) return;
          await delay(50);
        }
        throw new Error(`${label}: native video misaligned or covers controls: ${JSON.stringify(lastState)}`);
      };
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        if (await execute("document.querySelector('.slot-media').hidden")) await click("Video panel");
        await selectMediaView("video");
        await waitFor("!!document.querySelector('.native-video')");
        for (const [width,height] of [[360,480],[460,760],[620,480],[960,760],[1280,900]]) {
          win.setContentSize(width,height);
          await delay(120);
          await checkPosition(`${skin.name} ${width}x${height}`);
          for (const title of ['A very long song title that wraps across multiple lines and changes the height of the transport panel','Short']) {
            trackUpdates.next({video:{videoId:'a',title,author:'Northbound'},meta:{counterpartVideoId:'video-a',duration:266}});
            await waitFor(`document.querySelector('.track-display h1')?.textContent===${JSON.stringify(title)}`);
            await checkPosition(`${skin.name} ${width}x${height} title change`);
          }
          await execute("document.querySelector('.player-media').style.transform='translate(5px, -8px)'");
          await checkPosition(`${skin.name} ${width}x${height} position-only shift`);
          await execute("document.querySelector('.player-media').style.removeProperty('transform')");
          await checkPosition(`${skin.name} ${width}x${height} restored position`);
        }
      }
      console.log('PASS: native video stays aligned and clear of controls across all seven skins at five window sizes, track title changes and position-only shifts.');
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_VIDEO_CONTROLS_ONLY === "1") {
      const waitFullscreen = async (enabled: boolean) => {
        for (let attempt = 0; attempt < 80; attempt++) {
          if (win.isFullScreen() === enabled && await youtube.webContents.executeJavaScript("!!document.fullscreenElement") === enabled) { await delay(250); return; }
          await delay(100);
        }
        throw new Error(`Fullscreen button did not ${enabled ? "enter" : "exit"} fullscreen`);
      };
      const clickFullscreenButton = async (label: string) => {
        win.focus(); youtube.webContents.focus();
        const point = await youtube.webContents.executeJavaScript(`(() => { const rect = document.querySelector('[data-sweetspot-video-controls] button[aria-label="${label}"]').getBoundingClientRect(); return { x: Math.round(rect.x+rect.width/2), y: Math.round(rect.y+rect.height/2) }; })()`);
        youtube.webContents.sendInputEvent({ type: "mouseMove", movementX: 1, movementY: 1, x: 20, y: 20 });
        youtube.webContents.sendInputEvent({ type: "mouseMove", movementX: 1, movementY: 1, ...point });
        await delay(200);
        assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls]')).opacity"), "1", "Video controls do not appear on hover");
        youtube.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
        youtube.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
      };
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        if (await execute("document.querySelector('.slot-media').hidden")) await click("Video panel");
        await selectMediaView("video");
        await delay(500);
        assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls] button')).backgroundColor"), "rgba(0, 0, 0, 0.5)");
        await youtube.webContents.executeJavaScript("document.querySelector('video').dispatchEvent(new MouseEvent('dblclick', {bubbles:true, button:0, detail:2}))", true);
        await delay(100);
        assert.equal(await youtube.webContents.executeJavaScript("!!document.fullscreenElement"), false, `${skin.name} double-click still opens fullscreen`);
        const paused = await youtube.webContents.executeJavaScript("document.querySelector('video').paused");
        // Hold an already-running pane update across fullscreen entry. Real page
        // commands return asynchronously and must not detach the fullscreen view.
        let releasePresentation!: () => void;
        let presentationReached!: () => void;
        const presentationReady = new Promise<void>(resolve => { presentationReached = resolve; });
        const presentationRelease = new Promise<void>(resolve => { releasePresentation = resolve; });
        fixture.videoPresentationBarrier = async () => { presentationReached(); await presentationRelease; };
        const pendingPresentation = playerMode().setVideo({ ...youtube.getBounds(), pictureFrame: skin.id === "builtin-pop" });
        await presentationReady;
        await clickFullscreenButton("Enter fullscreen");
        await waitFullscreen(true);
        fixture.videoPresentationBarrier = null;
        releasePresentation();
        await pendingPresentation;
        // YouTube can rebuild its controller on fullscreen/layout changes. Moving
        // the live media with moveBefore preserves playback while replacing the wrapper.
        await youtube.webContents.executeJavaScript(`(() => {
          const controller = document.querySelector('#movie_player');
          const replacement = document.createElement('div');
          replacement.id = 'movie_player';
          controller.before(replacement);
          replacement.moveBefore(document.querySelector('video'), null);
          controller.remove();
        })()`);
        // Stay fullscreen through queued pane reports and the native window animation.
        await playerMode().setVideo(null);
        await delay(1000);
        assert.equal(win.isFullScreen(), true, `${skin.name} native fullscreen closed after entry`);
        assert.equal(await youtube.webContents.executeJavaScript("!!document.fullscreenElement"), true, `${skin.name} HTML fullscreen closed after entry`);
        youtube.webContents.sendInputEvent({ type: "mouseMove", movementX: 1, movementY: 1, x: 20, y: 20 });
        await delay(200);
        assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls]')).opacity"), "1", `${skin.name} fullscreen controls did not appear on mouse movement`);
        // Native fullscreen/compositor transitions can deliver a final mousemove
        // after the injected one. Wait for the actual inactivity fade to settle.
        for (let idleAttempt = 0; idleAttempt < 50; idleAttempt++) {
          if (await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls]')).opacity") === "0") break;
          await delay(100);
        }
        assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('[data-sweetspot-video-controls]')).opacity"), "0", `${skin.name} fullscreen controls did not hide after inactivity: ${await youtube.webContents.executeJavaScript("JSON.stringify({visible:document.querySelector('[data-sweetspot-video-controls]').hasAttribute('data-visible'),fullscreen:document.documentElement.hasAttribute('data-sweetspot-video-fullscreen'),focused:document.activeElement?.tagName})")}`);
        youtube.webContents.sendInputEvent({ type: "mouseMove", movementX: 1, movementY: 1, x: 21, y: 21 });
        await delay(200);
        const buttonSample = await youtube.webContents.executeJavaScript("(() => { const r = document.querySelector('[data-sweetspot-video-controls] button').getBoundingClientRect(); return {x:r.x+6,y:r.y+r.height/2,width:innerWidth,height:innerHeight,appearance:getComputedStyle(document.querySelector('[data-sweetspot-video-controls] button')).appearance}; })()");
        assert.equal(buttonSample.appearance, "none", "Native button appearance overrides the transparent background");
        const controlsPicture = await capturePlayerPage(youtube.webContents);
        const pictureSize = controlsPicture.getSize();
        const sampleX = Math.floor(buttonSample.x * pictureSize.width / buttonSample.width);
        const sampleY = Math.floor(buttonSample.y * pictureSize.height / buttonSample.height);
        const pixelOffset = (sampleY * pictureSize.width + sampleX) * 4;
        const controlsPixels = controlsPicture.toBitmap();
        assert.ok(Math.max(...controlsPixels.subarray(pixelOffset, pixelOffset + 3)) < 128, `${skin.name} fullscreen button is visibly pale`);
        if (skin.id === "builtin-spotlight") writeFileSync('/private/tmp/player-fullscreen-control.png', controlsPicture.toPNG());
        await clickFullscreenButton("Exit fullscreen");
        await waitFullscreen(false);
        assert.equal(await youtube.webContents.executeJavaScript("document.querySelector('video').paused"), paused, `${skin.name} fullscreen button changed playback`);
      }
      await trayCaller.fullMode();
      assert.equal(await youtube.webContents.executeJavaScript("!!document.querySelector('[data-sweetspot-video-controls]')"), false);
      console.log("PASS: persistent fullscreen through controller replacement and pending pane updates, native button entry/exit, unchanged playback and full-mode cleanup for all seven skins.");
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_SCREEN_FIT_ONLY === "1") {
      for (const skin of BUILTIN_SKINS.filter(skin => !["album", "spotlight"].includes(skin.layout.arrangement))) {
        await trayCaller.select(skin.id);
        await trayCaller.preferences({ id: skin.id, values: { videoExpanded: false, queueExpanded: true, eqExpanded: false } });
        await waitFor("!!document.querySelector('.slot-media[hidden]')");
        await execute("document.querySelector('.slot-queue .panel-resizer').dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))");
        await delay(200);
        const workArea = screen.getDisplayMatching(win.getBounds()).workArea;
        win.setContentSize(560, workArea.height - 40);
        await delay(300);
        const bounds = win.getBounds();
        win.setBounds({ ...bounds, y: workArea.y + workArea.height - bounds.height });
        const queueBefore = await execute("document.querySelector('.slot-queue').getBoundingClientRect().height");
        await click("Video panel");
        await delay(400);
        const fitted = win.getBounds();
        assert.ok(fitted.y >= workArea.y && fitted.y + fitted.height <= workArea.y + workArea.height + 1, `${skin.name} window exceeds screen: ${JSON.stringify({ fitted, workArea })}`);
        const panels = await execute("(() => { const queue = document.querySelector('.slot-queue').getBoundingClientRect(); const transport = document.querySelector('.slot-transport').getBoundingClientRect(); return { queue: queue.height, bottom: Math.max(queue.bottom, transport.bottom), height: innerHeight, overflow: document.documentElement.scrollHeight > innerHeight + 1 }; })()");
        assert.ok(panels.queue < queueBefore - 20, `${skin.name} did not reduce the queue: ${JSON.stringify({ queueBefore, panels })}`);
        assert.ok(panels.bottom <= panels.height + 1 && !panels.overflow, `${skin.name} controls overflow: ${JSON.stringify(panels)}`);
      }
      console.log("PASS: opening video reduces the queue and keeps the window and controls inside the display work area for every stacked skin.");
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    if (process.env.PLAYER_TEST_VIDEO_PAUSE_ONLY === "1") {
      await youtube.webContents.executeJavaScript("window.autoPlayOnModeSwitch = true");
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        const panelButton = ["album", "spotlight"].includes(skin.layout.arrangement) ? "Artwork or video" : "Video panel";
        if (await execute("document.querySelector('.slot-media').hidden")) await click("Video panel");
        await selectMediaView("video");
        await delay(200);
        for (const playing of [false, true]) {
          await youtube.webContents.executeJavaScript(`testPlayer.cancelSkinVideoModePause(); ${playing ? "document.querySelector('video').play()" : "document.querySelector('video').pause()"}`);
          for (let toggle = 0; toggle < 2; toggle++) {
            await click(panelButton);
            await delay(150);
            assert.equal(await youtube.webContents.executeJavaScript("document.querySelector('video').paused"), !playing, `${skin.name} panel toggle changed playback (playing=${playing})`);
          }
        }

      }
      console.log("PASS: opening and closing video preserves paused and playing states across all seven skins, including delayed site autoplay.");
      clearTimeout(timeout);
      win.destroy();
      app.exit(0);
      return;
    }
    if (process.env.PLAYER_TEST_VIDEO_ONLY === "1") {
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        if (await execute("document.querySelector('.slot-media').hidden")) await click("Video panel");
        await waitFor("!!document.querySelector('.slot-media:not([hidden])')");
        await selectMediaView("video");
        await waitFor("!!document.querySelector('.player-media.native-video')");
        await delay(250);
        assert.equal(youtube.getVisible(), true, `${skin.name} native video hidden`);
        const defaultStage = await execute("(() => { const area = document.querySelector('.player-media'); const root = getComputedStyle(document.querySelector('.skinned-player')); return { height: area.getBoundingClientRect().height, expected: parseFloat(root.getPropertyValue('--video-default')), minimum: parseFloat(root.getPropertyValue('--video-min')), backdrop: getComputedStyle(area).backgroundColor }; })()");
        assert.ok(Math.abs(defaultStage.height - defaultStage.expected) < 3, `${skin.name} default video size: ${JSON.stringify(defaultStage)}`);
        if (['builtin-spotlight', 'builtin-studio', 'builtin-aurora'].includes(skin.id)) assert.equal(defaultStage.backdrop, 'rgba(0, 0, 0, 0)', `${skin.name} forces a black backdrop`);
        assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.documentElement).backgroundColor"), 'rgba(0, 0, 0, 0)');
        assert.equal(await youtube.webContents.executeJavaScript("[...document.querySelectorAll('[data-sweetspot-skin-video=ancestor]')].every(element => { const style = getComputedStyle(element); return style.overflowX === 'hidden' && style.overflowY === 'hidden'; })"), true, `${skin.name} native video ancestors can show scrollbars`);
        const picture = (await capturePlayerPage(youtube.webContents)).toBitmap();
        let visiblePixels = 0;
        for (let pixel = 0; pixel < picture.length; pixel += 4)
          if (picture[pixel] > 60 && picture[pixel + 1] > 30 && picture[pixel + 2] < 40) visiblePixels++;
        assert.ok(visiblePixels > 100, `${skin.name} transparent video surface lost the picture`);
        const nativeBounds = youtube.getBounds();
        if (skin.id !== "builtin-studio" && Math.abs(nativeBounds.width / nativeBounds.height - 16 / 9) > .02) {
          let transparentPixels = 0;
          for (let pixel = 3; pixel < picture.length; pixel += 4) if (picture[pixel] === 0) transparentPixels++;
          assert.ok(transparentPixels > 100, `${skin.name} letterboxing is still opaque in the native surface`);
        }
        if (process.env.PLAYER_CAPTURE_DIR) {
          writeFileSync(join(process.env.PLAYER_CAPTURE_DIR, `${skin.id}-default-video.png`), (await capturePlayerPage(wc)).toPNG());
        }
        for (const width of [360, 820]) {
          win.setContentSize(width, 480);
          await delay(400);
          const geometry = await execute("(() => { const area = document.querySelector('.player-media').getBoundingClientRect(); return { height: area.height, bottom: area.bottom, window: innerHeight, minimum: parseFloat(getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--video-min')), overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 }; })()");
          assert.ok(geometry.height >= geometry.minimum - 1, `${skin.name} video too small at ${width}: ${JSON.stringify(geometry)}`);
          assert.ok(geometry.bottom <= geometry.window + 1 && !geometry.overflow, `${skin.name} video overflows at ${width}: ${JSON.stringify(geometry)}`);
          if (skin.id === "builtin-studio") {
            // Fit a 5:3 recording at full width by changing pane height, without cropping.
            await youtube.webContents.executeJavaScript("window.nativeTestCanvas.width = 300");
            await delay(1300);
            assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('video')).objectFit"), "contain");
            const fit = await execute("(() => { const rect = document.querySelector('.player-media').getBoundingClientRect(); return {width: rect.width, height: rect.height}; })()");
            assert.ok(Math.abs(fit.width/fit.height - 5/3) < .02, `Studio did not follow the source aspect ratio: ${JSON.stringify(fit)}`);
            const filled = (await capturePlayerPage(youtube.webContents)).toBitmap();
            let emptyPixels = 0;
            for (let pixel = 3; pixel < filled.length; pixel += 4) if (filled[pixel] === 0) emptyPixels++;
            assert.ok(emptyPixels < filled.length / 4 * .01, `Studio leaves empty margins at ${width}`);
            await youtube.webContents.executeJavaScript("window.nativeTestCanvas.width = 320");
            await delay(1200);
          }
          if (skin.id === "builtin-pop") {
            assert.equal(await execute("getComputedStyle(document.querySelector('.player-media')).outlineStyle"), "none", "Pop still outlines the letterbox area");
            const frame = await youtube.webContents.executeJavaScript("(() => { const video = document.querySelector('video'); const frame = document.querySelector('[data-sweetspot-video-frame]'); const rect = frame.getBoundingClientRect(); const scale = Math.min((innerWidth-10)/video.videoWidth, (innerHeight-10)/video.videoHeight); return { width: rect.width, height: rect.height, x: rect.x, y: rect.y, expectedWidth: video.videoWidth*scale+6, expectedHeight: video.videoHeight*scale+6, paneWidth: innerWidth, paneHeight: innerHeight, border: getComputedStyle(frame).borderTopWidth, shadow: getComputedStyle(frame).boxShadow }; })()");
            assert.ok(Math.abs(frame.width - frame.expectedWidth) < 1 && Math.abs(frame.height - frame.expectedHeight) < 1, `Pop frame does not match the picture: ${JSON.stringify(frame)}`);
            assert.ok(Math.abs(frame.x - (frame.paneWidth-frame.width-4)/2) < 1 && Math.abs(frame.y - (frame.paneHeight-frame.height-4)/2) < 1, "Pop frame is not centered on the picture");
            assert.equal(frame.border, "3px");
            assert.ok(frame.shadow.includes("4px 4px 0px"), "Pop lost its offset ink shadow");
            assert.ok(frame.x + frame.width + 4 <= frame.paneWidth + 1 && frame.y + frame.height + 4 <= frame.paneHeight + 1, "Pop shadow is clipped by the video pane");
          }
          if (process.env.PLAYER_CAPTURE_DIR) writeFileSync(join(process.env.PLAYER_CAPTURE_DIR, `${skin.id}-${width}-video.png`), (await capturePlayerPage(wc)).toPNG());
        }
        if (skin.id === "builtin-pop") {
          // Widescreen music videos must update the border when intrinsic dimensions change.
          await youtube.webContents.executeJavaScript("window.nativeTestCanvas.width = 420");
          await delay(300);
          const wideFrame = await youtube.webContents.executeJavaScript("(() => { const video = document.querySelector('video'); const rect = document.querySelector('[data-sweetspot-video-frame]').getBoundingClientRect(); return { videoWidth: video.videoWidth, ratio: (rect.width-6)/(rect.height-6) }; })()");
          assert.equal(wideFrame.videoWidth, 420);
          assert.ok(Math.abs(wideFrame.ratio - 21/9) < .01, "Pop border did not follow a widescreen video");
          await youtube.webContents.executeJavaScript("window.nativeTestCanvas.width = 320");
          await delay(150);
        }
      }
      // Saved tall windows and reopening must use the preferred video height,
      // rather than freezing Aurora at its 160px minimum above a large queue.
      await trayCaller.select("builtin-aurora");
      await waitFor("document.querySelector('.player-brand')?.textContent.includes('Aurora')");
      await trayCaller.preferences({ id: "builtin-aurora", values: { videoExpanded: true } });
      win.setContentSize(560, 1300);
      await delay(500);
      const savedAuroraHeight = await execute("innerHeight");
      await trayCaller.fullMode();
      await trayCaller.enter();
      await delay(500);
      wc.reload();
      await waitFor("!!document.querySelector('.player-media.native-video')");
      await delay(300);
      const restoredAurora = await execute("(() => { const area = document.querySelector('.player-media').getBoundingClientRect(); return { height: area.height, expected: parseFloat(getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--video-default')), window: innerHeight }; })()");
      assert.ok(Math.abs(restoredAurora.height - restoredAurora.expected) < 3, `Aurora restored video is too small: ${JSON.stringify(restoredAurora)}`);
      assert.ok(Math.abs(restoredAurora.window - savedAuroraHeight) < 3, `Aurora changed the saved window height from ${savedAuroraHeight}: ${JSON.stringify(restoredAurora)}`);
      await click("Video panel");
      wc.reload();
      await waitFor("!!document.querySelector('.slot-media[hidden]')");
      await click("Video panel");
      await waitFor("!!document.querySelector('.player-media.native-video')");
      await delay(300);
      assert.ok(await execute("Math.abs(document.querySelector('.player-media').getBoundingClientRect().height - parseFloat(getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--video-default'))) < 3"), "Aurora reopened video uses the minimum instead of the default");
      await trayCaller.fullMode();
      assert.equal(await youtube.webContents.executeJavaScript("document.documentElement.hasAttribute('data-sweetspot-skin-video-active')"), false);
      assert.equal(await youtube.webContents.executeJavaScript("!!document.querySelector('[data-sweetspot-video-frame]')"), false);
      assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.querySelector('#player')).overflow"), 'auto', 'Full mode must restore the original scrolling style');
      assert.equal(await youtube.webContents.executeJavaScript("document.documentElement.hasAttribute('data-sweetspot-video-fill')"), false);
      console.log("PASS: video defaults, narrow/wide minimums and backdrops for all seven skins; native transparency and full-mode cleanup.");
      trayModeSubscription.unsubscribe();
      clearTimeout(timeout);
      win.destroy();
      app.exit(0);
      return;
    }
    if (process.env.PLAYER_TEST_RUNTIME_ONLY === "1") {
      // A cold development renderer catches optimizer/React-dispatcher failures
      // that cannot occur in the already-bundled production fixture.
      for (const skin of BUILTIN_SKINS) {
        await trayCaller.select(skin.id);
        await waitFor(`document.querySelector('.player-brand')?.textContent.includes(${JSON.stringify(skin.name)})`);
        await waitFor("document.querySelectorAll('.queue-menu-trigger').length === 100");
        await execute("document.querySelector('.queue-menu-trigger').click()");
        await waitFor("document.querySelectorAll('.queue-song-menu [role=menuitem]').length === 5");
        await execute("document.querySelector('.queue-song-menu').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
        await waitFor("!document.querySelector('.queue-song-menu')");
      }
      wc.reload();
      await waitFor("document.querySelectorAll('.queue-menu-trigger').length === 100");
      await execute("document.querySelector('.queue-menu-trigger').click()");
      await waitFor("!!document.querySelector('.queue-song-menu')");
      const queueBeforeExit = await youtube.webContents.executeJavaScript("testPlayer.playerQueue()");
      await trayCaller.fullMode();
      assert.deepEqual(await youtube.webContents.executeJavaScript("testPlayer.playerQueue()"), queueBeforeExit);
      await trayCaller.enter();
      await waitFor("document.querySelectorAll('.queue-menu-trigger').length === 100");
      console.log("PASS: cold renderer startup, all skin queue menus, Escape dismissal, renderer reload and full-mode queue continuity.");
      trayModeSubscription.unsubscribe();
      clearTimeout(timeout);
      win.destroy();
      app.exit(0);
      return;
    }
    if (process.env.PLAYER_PROFILE_SPECTRUM === "1") {
      await trayCaller.select("builtin-aurora");
      fixture.spectrumDynamic = true;
      await delay(1000);
      const pid = wc.getOSProcessId();
      const cpu = () => app.getAppMetrics().find(metric => metric.pid === pid)?.cpu.cumulativeCPUUsage ?? 0;
      wc.debugger.attach("1.3");
      await wc.debugger.sendCommand("Profiler.enable");
      const phases: unknown[] = [];
      for (const enabled of [false, true, false, true]) {
        await trayCaller.preferences({id: "builtin-aurora", values: {spectrumEnabled: enabled}});
        await delay(800);
        const before = cpu(), start = performance.now();
        await wc.debugger.sendCommand("Profiler.start");
        await delay(4000);
        const used = cpu() - before, elapsed = (performance.now() - start) / 1000;
        const {profile} = await wc.debugger.sendCommand("Profiler.stop");
        const counts = new Map<number, number>();
        for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
        const hot = profile.nodes.map(node => ({name: node.callFrame.functionName, url: node.callFrame.url, samples: counts.get(node.id) ?? 0})).sort((a,b) => b.samples - a.samples).slice(0, 8);
        phases.push({enabled, cpuPercentOfOneCore: +(used / elapsed * 100).toFixed(2), hot});
      }
      wc.debugger.detach();
      console.log("SPECTRUM_PROFILE", JSON.stringify(phases));
      clearTimeout(timeout); win.destroy(); app.exit(0); return;
    }
    assert.equal(await execute("typeof require"), "undefined");
    assert.equal(
      await execute("!!document.querySelector('.player-chrome')"),
      false,
      "Player has a separate window bar",
    );
    assert.equal(Menu.getApplicationMenu()?.getMenuItemById("sweetspot-player-mode")?.checked, true);
    if (process.platform === "darwin") assert.equal(buttonVisibility.at(-1), false);

    assert.equal(await execute("typeof window.api"), "undefined");
    assert.equal(wc.getLastWebPreferences().sandbox, true);
    assert.equal(wc.getLastWebPreferences().nodeIntegration, false, "nodeIntegration");
    const settingsWindow = new BrowserWindow({
      show: false,
      width: 1000, height: 820,
      webPreferences: { sandbox: true, preload: join(directory, "preload/appearance.js") },
    });
    // Exercise the same detach/show helper used by the real Settings service.
    settingsWindow.setParentWindow(win);
    showIndependentSettingsWindow(settingsWindow, win, true);
    assert.equal(settingsWindow.getParentWindow(), null);
    const mainPosition = win.getPosition(),
      settingsPosition = settingsWindow.getPosition();
    win.setPosition(mainPosition[0] + 30, mainPosition[1] + 20);
    await delay(150);
    assert.deepEqual(
      settingsWindow.getPosition(),
      settingsPosition,
      "Settings followed player movement",
    );
    const movedMain = win.getPosition();
    settingsWindow.setPosition(settingsPosition[0] + 30, settingsPosition[1] + 20);
    await delay(150);
    assert.deepEqual(win.getPosition(), movedMain, "Player followed Settings movement");
    const movedSettings = settingsWindow.getPosition();
    showIndependentSettingsWindow(settingsWindow, win);
    assert.deepEqual(
      settingsWindow.getPosition(),
      movedSettings,
      "Opening Settings reset its position",
    );
    win.setPosition(...mainPosition);
    handler.attachWindow(settingsWindow);
    await settingsWindow.loadFile(join(directory, "renderer/appearance.html"));
    const appearanceExecute = (code: string) =>
      settingsWindow.webContents.executeJavaScript(code, true);
    async function appearanceWait(expression: string) {
      for (let i = 0; i < 80; i++) {
        if (await appearanceExecute(expression)) return;
        await delay(100);
      }
      throw new Error(`Appearance timed out: ${expression}`);
    }
    (settings as any).openSettingsWindow = async (page: string) => {
      await navigateSettingsWindow(settingsWindow, page);
      showIndependentSettingsWindow(settingsWindow, win);
      return settingsWindow;
    };
    await appearanceExecute("window.settingsSessionMarker = 'preserved'");
    await trayCaller.openAppearance();
    await trayCaller.openAppearance();
    assert.equal(await appearanceExecute("window.settingsSessionMarker"), "preserved", "Appearance shortcut reloaded Settings");
    assert.equal(new URL(settingsWindow.webContents.getURL()).hash, "#/appearance/skins");
    await appearanceWait("document.querySelectorAll('.skin-choice').length === 7");
    await appearanceExecute("document.querySelector('input[name=player-skin]:checked').focus()");
    settingsWindow.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
    settingsWindow.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
    await appearanceWait(`document.querySelector('input[name=player-skin]:checked').value === ${JSON.stringify(BUILTIN_SKINS[1].id)}`);
    assert.equal(fixture.playing, true, "Choosing a skin interrupted playback");
    for (const id of ["builtin-focus", "builtin-classic", "builtin-sleeve", "builtin-aurora", "builtin-pop"].filter(id => !process.env.PLAYER_TEST_SKIN || id === process.env.PLAYER_TEST_SKIN)) {
      await appearanceWait("document.querySelectorAll('.skin-choice').length === 7");
      assert.equal(await appearanceExecute("document.querySelectorAll('.skin-choice .skin-preview').length"), 7);
      await appearanceExecute(`document.querySelector('input[name="player-skin"][value="${id}"]').click()`);
      const name =
        id.replace("builtin-", "")[0].toUpperCase() + id.replace("builtin-", "").slice(1);
      await waitFor(`document.querySelector('.player-brand').textContent.includes('${name}')`);
      if (id === "builtin-pop") {
        await waitFor("!!document.querySelector('.artwork-frame')");
        await waitFor("!!document.querySelector('.pop-artist-banner img')");
        const popQueueSize = await execute("(() => { const list = document.querySelector('.queue-list'); return { height: list.clientHeight, rows: [...list.children].slice(0,3).reduce((sum,row)=>sum + row.getBoundingClientRect().height,0), panel: document.querySelector('.slot-queue').getBoundingClientRect().height, minimum: getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--queue-min') }; })()");
        assert.ok(popQueueSize.height >= popQueueSize.rows, `Pop default queue must show at least three complete rows: ${JSON.stringify(popQueueSize)}`);
        const requests = fixture.artistRequests;
        await execute("window.originalArtistImage = document.querySelector('.pop-artist-banner img')");
        trackUpdates.next({ video: { videoId: "video-a", title: "After the Rain", author: "Record label", channelId: "label" }, meta: { counterpartVideoId: "a", duration: 266 } });
        await delay(250);
        assert.equal(fixture.artistRequests, requests, "Video counterpart must retain the artist lookup");
        assert.equal(await execute("document.querySelector('.pop-artist-banner img') === window.originalArtistImage"), true);
        trackUpdates.next({ video: { videoId: "next", title: "Neon Streets", author: "Northbound", channelId: "artist" }, meta: { duration: 266 } });
        await delay(250);
        assert.equal(fixture.artistRequests, requests, "Same artist must not reload between songs");
        assert.equal(await execute("document.querySelector('.pop-artist-banner img') === window.originalArtistImage"), true);
        trackUpdates.next({ video: { videoId: "other", title: "New artist", author: "Southbound", channelId: "other" }, meta: { duration: 266 } });
        await delay(50);
        assert.equal(await execute("document.querySelector('.pop-artist-banner img') === window.originalArtistImage"), true, "Keep old artwork during new lookup");
        await waitFor("document.querySelector('.pop-artist-banner img')?.src.endsWith('artist-other')");
        trackUpdates.next({ video: { videoId: "a", title: "After the Rain", author: "Northbound" }, meta: { isAudioExclusive: true, counterpartVideoId: "video-a", duration: 266, thumbnail: "https://i.ytimg.com/test-art.png" } });
        await delay(250);

        await execute("document.querySelector('.queue-list').scrollTop = 0");
        writeFileSync('/private/tmp/pop-artwork.png', (await capturePlayerPage(wc)).toPNG());
        await selectMediaView("video");
        await waitFor("!!document.querySelector('.native-video')");
      }
      if (id === "builtin-classic") {
        await waitFor("Boolean(document.querySelector('.spectrum-bar')?.getAttribute('d'))");
        assert.equal(
          await execute("document.querySelector('.retro-clock').getAttribute('aria-label')"),
          "1:42",
        );
      }

      if (id === "builtin-aurora") {
        fixture.spectrumDynamic = true;
        await waitFor("Boolean(document.querySelector('.spectrum-wave .spectrum-bar')?.getAttribute('d'))");
        const mutations = await execute(`new Promise(resolve => {
          const spectrum = document.querySelector('.spectrum-wave');
          let writes = 0;
          const observer = new MutationObserver(records => writes += records.length);
          observer.observe(spectrum, {subtree: true, attributes: true, attributeFilter: ['d']});
          setTimeout(() => {observer.disconnect(); resolve(writes);}, 1100);
        })`);
        fixture.spectrumDynamic = false;
        assert.equal(await execute("getComputedStyle(document.querySelector('.spectrum-wave .spectrum-bar')).transform"), "none", "Wave bars must stay centered after path consolidation");
        assert.ok(mutations > 0 && mutations <= 24, `Wave exceeded paint budget: ${mutations} SVG writes / 1.1s`);
        assert.equal(await execute("document.querySelectorAll('.spectrum-wave .spectrum-bar').length"), 1);
        console.log(`Spectrum budget: ${mutations} SVG writes / 1.1s (formerly hundreds per refresh)`);
      }

      await appearanceWait(
        `document.querySelector('.skin-settings h2')?.textContent.includes('${name}')`,
      );
      assert.equal(
        await execute("!!document.querySelector('select[aria-label=\"Player skin\"]')"),
        false,
      );
      assert.equal(await appearanceExecute("document.querySelector('input[name=player-skin]:checked').value"), id);
      if (id === "builtin-classic") {
        writeFileSync("/private/tmp/skin-picker-classic.png", (await capturePlayerPage(settingsWindow.webContents)).toPNG());
        settingsWindow.setContentSize(480, 760);
        await delay(150);
        assert.equal(await appearanceExecute("document.documentElement.scrollWidth <= innerWidth"), true, "Narrow settings overflow horizontally");
        settingsWindow.setContentSize(1000, 820);
      }
      if (id === "builtin-focus") {
        for (const radius of [0, 28]) {
          await appearanceExecute(`(() => { const input = document.querySelector('.skin-setting input[type=range]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input, '${radius}');
            input.dispatchEvent(new Event('input', {bubbles:true})); })()`);
          await waitFor(`getComputedStyle(document.querySelector('.track-display')).borderRadius === '${radius}px'`);
          assert.equal(await appearanceExecute("document.querySelector('.skin-large-preview [data-module=transport] > rect:nth-of-type(2)').getAttribute('rx')"), String(radius));
        }
        await appearanceExecute("document.querySelector('.settings-actions button:nth-child(3)').click()");
        await waitFor("getComputedStyle(document.querySelector('.track-display')).borderRadius === '20px'");
      }
      if (id === "builtin-sleeve") {
        await selectMediaView("artwork");
        for (const [shape, label] of [['disc', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square']]) {
          await appearanceExecute(`[...document.querySelectorAll('.setting-options label')].find(e => e.textContent === '${label}').querySelector('input').click()`);
          await waitFor(`!!document.querySelector('.artwork-frame.cover-${shape}')`);
          await waitFor("document.querySelector('.cover').complete && document.querySelector('.cover').naturalWidth > 0");
          const frame = await execute(`(() => { const e = document.querySelector('.artwork-frame'); const r = e.getBoundingClientRect(); return {width:r.width,height:r.height,radius:getComputedStyle(e).borderRadius}; })()`);
          assert.ok(frame.width > 0 && Math.abs(frame.width - frame.height) < 1, "Artwork must be square before rounding/circular cropping");
          assert.equal(frame.radius, shape === 'disc' ? '50%' : shape === 'rounded' ? '12px' : '0px');
          assert.equal(await appearanceExecute("document.querySelector('.skin-large-preview [data-artwork-shape]').getAttribute('data-artwork-shape')"), shape);
        }
        await selectMediaView("video");
      }
      assert.equal(await execute("getComputedStyle(document.querySelector('.skin-module')).borderTopWidth"), id === 'builtin-classic' ? '1px' : '0px');
      assert.equal(await execute("getComputedStyle(document.querySelector('.skin-module')).borderRadius !== '0px'"), id === 'builtin-classic');
      const fontPair = {
        "builtin-pop": ["Manrope Variable", "Manrope Variable"],
        "builtin-focus": ["Inter Variable", "Manrope Variable"],
        "builtin-classic": ["Tahoma", "Tahoma"],
        "builtin-sleeve": ["Manrope Variable", "Cinzel Variable"],
        "builtin-aurora": ["Inter Variable", "Cinzel Variable"],
      }[id]!;
      await waitFor(`getComputedStyle(document.querySelector('.queue-track')).fontFamily.includes('${fontPair[0]}')`);
      assert.equal(await execute(`getComputedStyle(document.querySelector('${id === "builtin-aurora" ? ".glass-playlist-header h2" : ".track-display h1"}')).fontFamily.includes('${fontPair[1]}')`), true);
      assert.equal(await appearanceExecute("document.querySelectorAll('.font-options, fieldset[aria-label=\"Interface font\"], fieldset[aria-label=\"Heading font\"]').length"), 0);
      assert.equal(await appearanceExecute(`getComputedStyle(document.querySelector('.skin-large-preview .preview-track-heading')).fontFamily.includes('${fontPair[1]}')`), true);
      if (id === "builtin-aurora") {
        await waitFor("!!document.querySelector('.glass-header-cover img')");
        // A real image decode failure must replace the broken icon without changing queue layout.
        const coverBounds = await execute("JSON.stringify(document.querySelector('.glass-header-cover').getBoundingClientRect().toJSON())");
        await execute("document.querySelector('.glass-header-cover img').src = 'data:image/png;base64,broken'");
        await waitFor("!!document.querySelector('.glass-header-cover [data-cover-placeholder]')");
        assert.equal(await execute("!!document.querySelector('.glass-header-cover img')"), false);
        assert.equal(await execute("JSON.stringify(document.querySelector('.glass-header-cover').getBoundingClientRect().toJSON())"), coverBounds);
        const queueCover = await execute("!!document.querySelector('.glass-track-cover img')");
        if (queueCover) {
          await execute("document.querySelector('.glass-track-cover img').src = 'data:image/png;base64,broken'");
          await waitFor("!!document.querySelector('.glass-track-cover [data-cover-placeholder]')");
        }
        await appearanceExecute("document.querySelector('input[name=player-skin][value=builtin-focus]').click()");
        await waitFor("!document.querySelector('.glass-header-cover')");
        await appearanceExecute("document.querySelector('input[name=player-skin][value=builtin-aurora]').click()");
        await waitFor("document.querySelector('.glass-header-cover img')?.naturalWidth > 0");
        const loadedFonts = await execute(`Promise.all(['Cinzel Variable','Inter Variable','Manrope Variable'].map(async family => { const faces=await document.fonts.load('400 14px "'+family+'"'); return {family, count:faces.length, loaded:faces.every(face=>face.status==='loaded')}; }))`);
        assert.ok(loadedFonts.every((font: any) => font.count > 0 && font.loaded), 'Bundled Google Fonts failed to load');
        await waitFor("getComputedStyle(document.querySelector('.glass-playlist-header h2')).fontFamily.includes('Cinzel Variable')");
        assert.equal(await execute("getComputedStyle(document.querySelector('.queue-track')).fontFamily.includes('Inter Variable')"), true);
        assert.equal(await appearanceExecute("getComputedStyle(document.querySelector('.skin-large-preview .preview-track-heading')).fontFamily.includes('Cinzel Variable')"), true);


        if (process.platform === 'darwin') {
          await waitFor("document.querySelector('.skinned-player')?.dataset.transparent === 'true'");
          assert.equal(await execute("['html','body','#app'].every(selector => getComputedStyle(document.querySelector(selector)).backgroundColor === 'rgba(0, 0, 0, 0)')"), true, "An opaque renderer layer still covers the desktop");
          assert.equal(backgroundWrites.at(-1), '#00000000');
          assert.equal(vibrancyWrites.at(-1), 'under-window');
          assert.equal(win.getOpacity(), 1, 'Content must stay opaque');
          await appearanceExecute("[...document.querySelectorAll('.skin-setting')].find(e => e.textContent.includes('Desktop transparency')).querySelector('input').click()");
          await waitFor("document.querySelector('.skinned-player')?.dataset.transparent === 'false'");
          await delay(100);
          assert.equal(backgroundWrites.at(-1), originalWindowBackground);
          assert.equal(vibrancyWrites.at(-1), null);
          await appearanceExecute("[...document.querySelectorAll('.skin-setting')].find(e => e.textContent.includes('Desktop transparency')).querySelector('input').click()");
          await waitFor("document.querySelector('.skinned-player')?.dataset.transparent === 'true'");
        }
        await waitFor("!!document.querySelector('.glass-playlist-header') && !!document.querySelector('.spectrum-wave')");
        assert.equal(await execute("document.querySelector('.slot-transport').getBoundingClientRect().y > document.querySelector('.slot-queue').getBoundingClientRect().y"), true);
        assert.equal(await execute("!!document.querySelector('.sidebar')"), false);
        await appearanceExecute("[...document.querySelectorAll('.setting-options label')].find(e => e.textContent === 'Ocean').querySelector('input').click()");
        await waitFor("document.querySelector('.glass-backdrop radialGradient stop').getAttribute('stop-color') === '#226b72'");
        for (const target of ['Glass depth', 'Ambient glow']) {
          await appearanceExecute(`(() => { const input=[...document.querySelectorAll('.skin-setting')].find(e => e.querySelector('label')?.textContent === '${target}').querySelector('input');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'90');input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
        }
        await waitFor("Number(document.querySelector('.skinned-player').style.getPropertyValue('--glass-depth')) > .65");
        await waitFor("document.querySelector('.glass-backdrop g').getAttribute('opacity') === '0.9'");
        await appearanceExecute("document.querySelector('.settings-actions button:nth-child(3)').click()");
        await delay(200);
        writeFileSync('/private/tmp/aurora-default.png', (await capturePlayerPage(wc)).toPNG());
        writeFileSync('/private/tmp/aurora-appearance.png', (await capturePlayerPage(settingsWindow.webContents)).toPNG());
      }
      // Appearance edits preview without changing saved preferences. Cancel restores the player.
      await appearanceExecute(
        `[...document.querySelectorAll('.skin-setting')].find(e=>e.textContent.includes('Artist names')).querySelector('input').click()`,
      );
      await delay(200);
      assert.equal(await appearanceExecute("document.querySelector('.skin-gallery').disabled"), true, "Unsaved edits cannot be lost by switching skins");
      assert.equal(await appearanceExecute("document.querySelectorAll('.skin-large-preview [data-preview-artist]').length"), 0);
      assert.equal(await execute("String(!!document.querySelector('.queue-list small'))"), "false");
      await appearanceExecute("document.querySelector('.settings-actions button').click()");
      await delay(250);
      assert.equal((data.playerSkins as any).preferences[id].showArtist, false);
      await appearanceExecute(
        "[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Customize')).click()",
      );
      await appearanceWait("!!document.querySelector('.skin-settings')");
      await appearanceExecute(
        "document.querySelector('.settings-actions button:nth-child(3)').click();document.querySelector('.settings-actions button:nth-child(2)').click()",
      );
      await delay(200);
      assert.equal((data.playerSkins as any).preferences[id].showArtist, false);
      const mediaWasOpen = (data.playerSkins as any).preferences[id].videoExpanded;
      await click("Video panel");
      assert.equal((data.playerSkins as any).preferences[id].videoExpanded, !mediaWasOpen);
      if (!mediaWasOpen) {
        await delay(150);
        assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), true);
      }
      await click("Video panel");
      if (mediaWasOpen === false) {
        await delay(150);
        assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), false, `${id} hiding video did not select Song mode`);
      }
      assert.equal((data.playerSkins as any).preferences[id].videoExpanded, mediaWasOpen);
      if (!mediaWasOpen) await click("Video panel");
      await waitFor("(() => { const r=document.querySelector('.player-media').getBoundingClientRect(); return Math.abs(r.height - parseFloat(getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--video-default'))) < 2; })()");
      await selectMediaView("video");
      await delay(250);
      for (let attempt = 0; attempt < 20 && !youtube.getVisible(); attempt++) await delay(100);
      if (!youtube.getVisible()) console.error('Video layout', await execute(`JSON.stringify({rows:getComputedStyle(document.querySelector('.skin-layout')).gridTemplateRows, media:document.querySelector('.skin-layout').dataset.media, rect:document.querySelector('.player-media').getBoundingClientRect().toJSON(), view:document.querySelector('.media-tabs button:nth-of-type(2)').getAttribute('aria-pressed')})`));
      assert.equal(youtube.getVisible(), true, `${id} video view hidden`);
      assert.ok(await execute("document.querySelector('.player-media').getBoundingClientRect().height >= parseFloat(getComputedStyle(document.querySelector('.skinned-player')).getPropertyValue('--video-min')) - 1"), `${id} video smaller than the viewing minimum`);
      assert.equal(await youtube.webContents.executeJavaScript("getComputedStyle(document.documentElement).backgroundColor"), "rgba(0, 0, 0, 0)", "Native video surface still forces an opaque matte");
      if (process.env.PLAYER_CAPTURE_DIR) writeFileSync(join(process.env.PLAYER_CAPTURE_DIR, `${id}-video.png`), (await capturePlayerPage(wc)).toPNG());
      if (id === 'builtin-classic') {
        const headerIcons = await execute(`(() => { const header=document.querySelector('.module-media .module-title'), buttons=[...header.querySelectorAll('.media-view-actions button')]; return {count:buttons.length, labels:buttons.map(b=>b.getAttribute('aria-label')), iconOnly:buttons.every(b=>b.textContent.trim()==='' && !!b.querySelector('svg')), inside:buttons.every(b=>b.getBoundingClientRect().top >= header.getBoundingClientRect().top && b.getBoundingClientRect().bottom <= header.getBoundingClientRect().bottom), contentTabs:document.querySelectorAll('.module-media .module-content .media-tabs').length}; })()`);
        assert.equal(headerIcons.count, 2);
        assert.deepEqual(headerIcons.labels, ['Artwork', 'Video']);
        assert.equal(headerIcons.iconOnly, true);
        assert.equal(headerIcons.inside, true);
        assert.equal(headerIcons.contentTabs, 0);
      }

      assert.ok(
        await youtube.webContents.executeJavaScript(
          "nativeTestVideo.getBoundingClientRect().width>0 && nativeTestVideo.getBoundingClientRect().height>0 && getComputedStyle(nativeTestVideo).visibility==='visible'",
        ),
        `${id} video not rendered`,
      );
      if (id === "builtin-classic") {
        assert.equal(await execute("document.querySelectorAll('.eq-fader-art').length"), 10);
        assert.equal(await execute("document.querySelector('.eq-fader-art').querySelectorAll('path').length >= 14"), true);
        const beforeHide = await execute("Object.fromEntries([...document.querySelectorAll('.module-slot')].filter(s=>!s.hidden).map(s=>[s.dataset.panel,s.getBoundingClientRect().height]))");
        const heightBeforeHide = win.getContentSize()[1];
        await click("Playlist");
        await waitFor("document.querySelector('.slot-queue').hidden");
        await delay(350);
        const hiddenLayout = await execute("(()=>{const slots=[...document.querySelectorAll('.module-slot')].filter(s=>!s.hidden);return {bottom:Math.max(...slots.map(s=>s.getBoundingClientRect().bottom)),height:innerHeight,sizes:Object.fromEntries(slots.map(s=>[s.dataset.panel,s.getBoundingClientRect().height]))};})()");
        assert.ok(Math.abs(hiddenLayout.bottom-hiddenLayout.height + 3) < 2, 'Hiding playlist leaves empty space below the player');
        for (const panel of ['transport','equalizer','media']) assert.ok(Math.abs(hiddenLayout.sizes[panel]-beforeHide[panel]) < 2, `Hiding playlist changed ${panel} height`);
        assert.ok(win.getContentSize()[1] < heightBeforeHide, 'Hiding playlist did not compact the window');
        writeFileSync('/private/tmp/classic-playlist-hidden.png', (await capturePlayerPage(wc)).toPNG());
        await click("Playlist");
        await waitFor("!document.querySelector('.slot-queue').hidden");
        await delay(350);
        assert.ok(Math.abs(win.getContentSize()[1]-heightBeforeHide) < 2, `Showing playlist did not restore the window height: before=${heightBeforeHide}, after=${win.getContentSize()[1]}, panels=${JSON.stringify(await execute("Object.fromEntries([...document.querySelectorAll('.module-slot')].filter(e=>!e.hidden).map(e=>[e.dataset.panel,e.getBoundingClientRect().height]))"))}, beforePanels=${JSON.stringify(beforeHide)}`);
        writeFileSync('/private/tmp/classic-refined.png', (await capturePlayerPage(wc)).toPNG());
        // Reproduce a cold start with EQ/playlist folded, then reopen an initially unmeasured queue.
        await click("Equalizer");
        await waitFor("document.querySelector('.slot-equalizer').hidden");
        await click("Playlist");
        await waitFor("document.querySelector('.slot-queue').hidden");
        const reloaded = new Promise<void>((resolve) => wc.once("did-finish-load", () => resolve()));
        wc.reload();
        await reloaded;
        await waitFor("document.querySelector('.skin-layout')?.dataset.queue === 'false'");
        await delay(250);
        await click("Playlist");
        await waitFor("!document.querySelector('.slot-queue').hidden && document.querySelector('.queue-list').clientHeight >= 100");
        assert.ok(await execute("document.querySelector('.slot-transport').getBoundingClientRect().height < 300"), 'Transport expanded into unused space');
        await click("Equalizer");
        await waitFor("!document.querySelector('.slot-equalizer').hidden");
        assert.equal(await execute("CSS.supports('corner-shape','superellipse(1.5)')"), true, 'Electron cannot render continuous corners');
        assert.equal(await execute("getComputedStyle(document.querySelector('.skin-layout')).borderRadius"), '17px');
        writeFileSync('/private/tmp/classic-continuous-corners.png', (await capturePlayerPage(wc)).toPNG());
      }
      const nativePicture = await capturePlayerPage(youtube.webContents);
      const frame = nativePicture.toBitmap();
      let coloredPixels = 0;
      for (let pixel = 0; pixel < frame.length; pixel += 4) {
        if (frame[pixel] > 60 && frame[pixel + 1] > 30 && frame[pixel + 2] < 40) coloredPixels++;
      }
      if (coloredPixels <= 100) console.log('NATIVE VIDEO', await youtube.webContents.executeJavaScript("(() => { const video = document.querySelector('video'); return { paused:video.paused, ready:video.readyState, dimensions:[video.videoWidth,video.videoHeight], rect:video.getBoundingClientRect().toJSON(), viewport:[innerWidth,innerHeight], root:getComputedStyle(document.documentElement).backgroundColor, visibility:getComputedStyle(video).visibility }; })()"), youtube.getBounds(), win.getBounds(), nativePicture.getSize());
      assert.ok(coloredPixels > 100, `${id} native video produces no visible picture`);
      await selectMediaView("artwork");
      await delay(150);
      assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), false, `${id} artwork did not select Song mode`);
      await selectMediaView("video");
      await delay(150);
      assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), true);
      assert.equal(fixture.progress, 102);
      assert.equal(fixture.playing, true);
      await youtube.webContents.executeJavaScript("document.querySelector('video').click()");
      await delay(800);
      const qualityLayout = await youtube.webContents.executeJavaScript(`(() => {
        const player = document.querySelector('#movie_player'), video = document.querySelector('video');
        return { controller: [player.clientWidth, player.clientHeight], viewport: [innerWidth,innerHeight],
          pictureFrame: document.documentElement.hasAttribute('data-sweetspot-picture-frame'),
          visibleVideo: [video.clientWidth,video.clientHeight], visibility:getComputedStyle(player).visibility,
          unrelatedVisibility:getComputedStyle(document.querySelector('body > div')).visibility };
      })()`);
      assert.ok(qualityLayout.controller[0] >= 1920 && qualityLayout.controller[1] >= 1080, 'Compact pane caps YouTube Auto below HD');
      assert.equal(qualityLayout.visibility, 'visible', 'YouTube sees the video controller as hidden');
      assert.equal(qualityLayout.unrelatedVisibility, 'hidden', 'Library UI leaked into the video pane');
      const expectedVideo = qualityLayout.viewport.map((size: number) => size - (qualityLayout.pictureFrame ? 10 : 0));
      assert.deepEqual(qualityLayout.visibleVideo, expectedVideo, 'HD controller changed visible video dimensions');
      assert.equal(
        await youtube.webContents.executeJavaScript("nativeTestVideo.paused"),
        true,
        "Video click pause did not persist",
      );
      assert.equal(
        await youtube.webContents.executeJavaScript("window.siteVideoClicks||0"),
        0,
        "Site handled the skin click twice",
      );
      await youtube.webContents.executeJavaScript("document.querySelector('video').click()");
      await delay(200);
      assert.equal(
        await youtube.webContents.executeJavaScript("nativeTestVideo.paused"),
        false,
        "Second video click did not resume",
      );
      if (id === "builtin-focus") {
        win.focus();
        youtube.webContents.focus();
        const clickVideo = () => {
          const bounds = youtube.getBounds();
          youtube.webContents.sendInputEvent({
            type: "mouseDown",
            x: Math.floor(bounds.width / 2),
            y: Math.floor(bounds.height / 2),
            button: "left",
            clickCount: 1,
          });
          youtube.webContents.sendInputEvent({
            type: "mouseUp",
            x: Math.floor(bounds.width / 2),
            y: Math.floor(bounds.height / 2),
            button: "left",
            clickCount: 1,
          });
        };
        clickVideo();
        await delay(800);
        assert.equal(
          await youtube.webContents.executeJavaScript("nativeTestVideo.paused"),
          true,
          `Native mouse click did not pause: ${await youtube.webContents.executeJavaScript("JSON.stringify(window.videoGestures.slice(-10))")}`,
        );
        clickVideo();
        await delay(1200);
        assert.equal(
          await youtube.webContents.executeJavaScript("nativeTestVideo.paused"),
          false,
          `Native mouse click did not resume: ${await youtube.webContents.executeJavaScript("JSON.stringify(window.videoGestures.slice(-10))")}`,
        );
      }

      if (process.env.PLAYER_TEST_FULLSCREEN === "1") {
      // The native fullscreen button must open/close fullscreen without toggling playback.
      // Earlier resize cases can leave the fixture partly offscreen. Native fullscreen
      // clamps such windows on return; keep it inside the work area for geometry assertions.
      const currentBounds = win.getBounds();
      const workArea = screen.getDisplayMatching(currentBounds).workArea;
      win.setPosition(currentBounds.x, Math.max(workArea.y, Math.min(currentBounds.y, workArea.y + workArea.height - currentBounds.height)));
      await delay(100);
      const paneBeforeFullscreen = youtube.getBounds();
      const windowBeforeFullscreen = win.getBounds();
      const rowsBeforeFullscreen = await execute("getComputedStyle(document.querySelector('.skin-layout')).gridTemplateRows");
      const togglesBeforeFullscreen = await youtube.webContents.executeJavaScript("window.videoToggleCount");
      const clickFullscreenControl = async () => {
        win.focus(); youtube.webContents.focus();
        const point = await youtube.webContents.executeJavaScript("(() => { const r = document.querySelector('[data-sweetspot-video-controls] button').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()");
        youtube.webContents.sendInputEvent({type: "mouseMove", movementX: 1, movementY: 1, ...point});
        await delay(200);
        youtube.webContents.sendInputEvent({type: "mouseDown", button: "left", clickCount: 1, ...point});
        youtube.webContents.sendInputEvent({type: "mouseUp", button: "left", clickCount: 1, ...point});
      };
      const waitFullscreen = async (enabled: boolean) => {
        for (let attempt = 0; attempt < 60; attempt++) {
          const html = await youtube.webContents.executeJavaScript("!!document.fullscreenElement");
          if (html === enabled && win.isFullScreen() === enabled) { await delay(350); return; }
          await delay(100);
        }
        throw new Error(`${id}: Video fullscreen failed to become ${enabled}; native=${win.isFullScreen()}; state=${await youtube.webContents.executeJavaScript("JSON.stringify({html:!!document.fullscreenElement,active:document.documentElement.hasAttribute('data-sweetspot-skin-video-active'),viewport:[innerWidth,innerHeight],rect:document.querySelector('video').getBoundingClientRect().toJSON(),toggles:window.videoToggleCount,gestures:window.videoGestures.slice(-10)})")}`);
      };
      await clickFullscreenControl();
      await waitFullscreen(true);
      assert.equal(playerMode().active, true, 'Fullscreen left skin mode');
      assert.deepEqual(youtube.getBounds(), { x: 0, y: 0, width: win.getContentSize()[0], height: win.getContentSize()[1] }, 'Fullscreen video did not fill the window');
      assert.equal(await youtube.webContents.executeJavaScript("nativeTestVideo.paused"), false, 'Fullscreen button paused playback');
      assert.equal(await youtube.webContents.executeJavaScript("window.videoToggleCount"), togglesBeforeFullscreen, 'Fullscreen button fired play/pause');
      if (id === "builtin-focus") {
        youtube.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
        youtube.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
      } else await clickFullscreenControl();
      await waitFullscreen(false);
      assert.deepEqual(win.getBounds(), windowBeforeFullscreen, 'Fullscreen changed the player window');
      assert.deepEqual(youtube.getBounds(), paneBeforeFullscreen, 'Fullscreen did not return to the video pane');
      assert.equal(await execute("getComputedStyle(document.querySelector('.skin-layout')).gridTemplateRows"), rowsBeforeFullscreen, 'Fullscreen changed panel heights');
      assert.equal(await youtube.webContents.executeJavaScript("window.videoToggleCount"), togglesBeforeFullscreen);

      }

      for (const width of [360, 460, 820]) {
        win.setSize(width, 480);
        await delay(200);
        if (id === "builtin-pop") {
          const edges = await execute("(() => { const row = document.querySelector('.queue-list li').getBoundingClientRect(); const header = document.querySelector('.queue-info').getBoundingClientRect(); const list = document.querySelector('.queue-list').getBoundingClientRect(); return { row: row.right, header: header.right, scroll: list.right, width: innerWidth }; })()");
          assert.ok(Math.abs(edges.row - edges.header) < 2, `Pop scrollbar shrinks rows at ${width}: ${JSON.stringify(edges)}`);
          assert.ok(edges.scroll <= edges.width, "Scrollbar must remain inside the player");
        }

        assert.equal(
          await execute(
            "document.documentElement.scrollWidth>innerWidth+1 || document.documentElement.scrollHeight>innerHeight+1",
          ),
          false,
          `${id} frame overflow at ${width}`,
        );
        const sections = await execute(
          "(()=>{const video=document.querySelector('.slot-media').getBoundingClientRect(),queue=document.querySelector('.slot-queue').getBoundingClientRect();return {video:{x:video.x,y:video.y,right:video.right,bottom:video.bottom},queue:{x:queue.x,y:queue.y,right:queue.right,bottom:queue.bottom}}})()",
        );
        assert.ok(
          sections.video.bottom <= sections.queue.y,
          `${id} video shares the playlist row at ${width}`,
        );
        assert.equal(sections.video.x, sections.queue.x);
        assert.equal(sections.video.right, sections.queue.right);
        assert.equal(sections.video.x, id === "builtin-classic" ? 3 : 0, `${id} exterior frame inset`);
        assert.equal(sections.video.right, (await execute("innerWidth")) - (id === "builtin-classic" ? 3 : 0), `${id} fixed width including exterior frame`);
        assert.equal(sections.video.bottom, sections.queue.y, `${id} panel gap`);
        if (id === "builtin-classic") {
          assert.equal(
            await execute(
              "document.querySelector('.slot-transport').getBoundingClientRect().bottom === document.querySelector('.slot-equalizer').getBoundingClientRect().top",
            ),
            true,
            "Classic EQ is not second",
          );
          assert.equal(
            await execute(
              "document.querySelector('.slot-equalizer').getBoundingClientRect().bottom === document.querySelector('.slot-media').getBoundingClientRect().top",
            ),
            true,
            "Classic video overlaps EQ",
          );
        }

        const eqGeometry = await execute(
          "(()=>{const slot=document.querySelector('.slot-equalizer'),panel=document.querySelector('.module-equalizer');return {hidden:getComputedStyle(slot).display==='none',scroll:slot.scrollHeight>slot.clientHeight+1,bottom:panel.getBoundingClientRect().bottom,height:innerHeight}})()",
        );
        if (!eqGeometry.hidden) {
          assert.equal(eqGeometry.scroll, false, `${id} equalizer scrolls at ${width}`);
          assert.ok(
            eqGeometry.bottom <= eqGeometry.height + 1,
            `${id} equalizer is clipped at ${width}`,
          );
        }

        await execute("document.querySelector('.queue-list').scrollTop=400");
        assert.ok(
          await execute("document.querySelector('.queue-list').scrollTop"),
          `${id} queue does not scroll`,
        );
        assert.equal(await execute("window.scrollY"), 0);
      }
      win.setSize(820, Math.min(1100, screen.getDisplayMatching(win.getBounds()).workArea.height - 180));
      await delay(250);
      const visiblePanels = await execute(
        "[...document.querySelectorAll('.module-slot')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.dataset.panel)",
      );
      for (const panel of visiblePanels) {
        const snapshot = () =>
          execute(
            "Object.fromEntries([...document.querySelectorAll('.module-slot')].filter(e=>getComputedStyle(e).display!=='none').map(e=>[e.dataset.panel,e.getBoundingClientRect().height]))",
          );
        const before = await snapshot();
        await execute(
          `document.querySelector('.slot-${panel} .panel-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`,
        );
        await delay(150);
        const after = await snapshot();
        assert.ok(
          after[panel] >= before[panel] + 19,
          `${id} ${panel} did not expand independently`,
        );
        for (const neighbour of visiblePanels.filter((name: string) => name !== panel))
          assert.ok(
            Math.abs(after[neighbour] - before[neighbour]) < 1,
            `${id} ${panel} changed ${neighbour} height`,
          );
      }

      // A late native notification must not unfreeze the untouched video pane.
      if (id === "builtin-pop") {
        const immediate = playerMode().resizeHeight.bind(playerMode());
        let delayed: ReturnType<typeof setTimeout> | undefined;
        const before = await execute("document.querySelector('.player-media').getBoundingClientRect().height");
        playerMode().resizeHeight = height => { clearTimeout(delayed); delayed = setTimeout(() => immediate(height), 750); };
        try {
          for (const key of ['ArrowDown', 'ArrowUp']) {
            await execute(`document.querySelector('.slot-queue .panel-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'${key}',bubbles:true}))`);
            await delay(950);
            const after = await execute("document.querySelector('.player-media').getBoundingClientRect().height");
            assert.ok(Math.abs(after - before) < 1, "Delayed playlist resize changed the video size");
          }
        } finally { clearTimeout(delayed); playerMode().resizeHeight = immediate; }
      }

      // Simulate native resize replies lagging behind a continuous drag/keyboard resize.
      const resizeHeightNow = playerMode().resizeHeight.bind(playerMode());
      let pendingResize: ReturnType<typeof setTimeout> | undefined;
      playerMode().resizeHeight = (height: number) => {
        clearTimeout(pendingResize);
        pendingResize = setTimeout(() => resizeHeightNow(height), 100);
      };
      const stablePanels = await execute("Object.fromEntries([...document.querySelectorAll('.module-slot')].filter(e=>getComputedStyle(e).display!=='none').map(e=>[e.dataset.panel,e.getBoundingClientRect().height]))");
      try {
        for (const key of ['ArrowUp', 'ArrowDown']) {
          await execute(`(async () => {
            for (let i = 0; i < 6; i++) {
              document.querySelector('.media-resizer').dispatchEvent(new KeyboardEvent('keydown', {key:'${key}',bubbles:true}));
              await new Promise(resolve => requestAnimationFrame(resolve));
            }
          })()`);
          await delay(180);
          const geometry = await execute(`(() => {
            const slots = [...document.querySelectorAll('.module-slot')].filter(e=>getComputedStyle(e).display!=='none');
            return { bottom: Math.max(...slots.map(e=>e.getBoundingClientRect().bottom)), viewport: innerHeight,
              panels: Object.fromEntries(slots.map(e=>[e.dataset.panel,e.getBoundingClientRect().height])) };
          })()`);
          assert.ok(Math.abs(geometry.viewport - geometry.bottom - (id === "builtin-classic" ? 3 : 0)) < 2, `${id} leaves empty space below the playlist after rapid ${key}: ${JSON.stringify(geometry)}`);
          for (const panel of visiblePanels.filter((name: string) => name !== 'media'))
            assert.ok(Math.abs(geometry.panels[panel] - stablePanels[panel]) < 1, `${id} resizing video changed ${panel}`);
        }
      } finally {
        clearTimeout(pendingResize);
        playerMode().resizeHeight = resizeHeightNow;
      }

      const beforeVideoHeight = await execute(
        "document.querySelector('.player-media').getBoundingClientRect().height",
      );
      await execute(
        "document.querySelector('.media-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))",
      );
      await delay(250);
      assert.ok(
        (await execute("document.querySelector('.player-media').getBoundingClientRect().height")) >
          beforeVideoHeight + 10,
        `${id} video cannot resize vertically`,
      );
      await execute(
        "document.querySelector('.media-resizer').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))",
      );
      await delay(150);
      assert.ok(
        (await execute("document.querySelector('.player-media').getBoundingClientRect().height")) <
          beforeVideoHeight,
        `${id} video cannot shrink`,
      );
      assert.equal(
        await execute(
          `Math.abs(Math.max(...[...document.querySelectorAll('.module-slot')].filter(e=>getComputedStyle(e).display!=='none').map(e=>e.getBoundingClientRect().bottom))-innerHeight+${id === "builtin-classic" ? 3 : 0})<1`,
        ),
        true,
        `${id} leaves unused space below panels`,
      );

      await execute(
        "(()=>{const b=document.querySelector('.queue-list button');b.focus();b.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));})()",
      );
      assert.equal(
        await execute(
          "document.activeElement === document.querySelector('.queue-list li:last-child button')",
        ),
        true,
      );
      assert.equal(await execute("window.scrollY"), 0);
      // Every skin gets the same pointer and keyboard reorder controls.
      await execute("document.querySelector('.queue-list').scrollTop = 0");
      const queueBefore = await youtube.webContents.executeJavaScript("testPlayer.playerQueue()");
      const selectionsBefore = await youtube.webContents.executeJavaScript("testPlayer.state.selectionChanges");
      assert.equal(await execute("document.querySelectorAll('.queue-menu-trigger').length"), queueBefore.items.length);
      assert.ok(await execute("[...document.querySelectorAll('.queue-menu-trigger')].every(button => { const bounds = button.getBoundingClientRect(); return bounds.width >= 24 && bounds.height >= 24; })"), `${id} reorder targets too small`);
      wc.sendInputEvent({ type: 'mouseMove', x: 10, y: 10 });
      await execute("document.activeElement.blur()");
      await waitFor("getComputedStyle(document.querySelector('.queue-duration')).opacity === '1'");
      const menuPoint = await execute("(() => { const button = document.querySelector('.queue-menu-trigger').getBoundingClientRect(); return { x: Math.round(button.x + button.width / 2), y: Math.round(button.y + button.height / 2) }; })()");
      wc.sendInputEvent({ type: 'mouseMove', x: menuPoint.x, y: menuPoint.y });
      await waitFor("getComputedStyle(document.querySelector('.queue-duration')).opacity === '0' && getComputedStyle(document.querySelector('.queue-menu-trigger')).opacity === '1'");
      wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: menuPoint.x, y: menuPoint.y });
      wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: menuPoint.x, y: menuPoint.y });
      await waitFor("!!document.querySelector('.queue-song-menu')");
      assert.ok(await execute("(() => { const bounds = document.querySelector('.queue-song-menu').getBoundingClientRect(); return bounds.top >= 0 && bounds.left >= 0 && bounds.bottom <= innerHeight && bounds.right <= innerWidth; })()"), `${id} menu clipped by queue or window`);
      if (process.env.PLAYER_CAPTURE_DIR) writeFileSync(join(process.env.PLAYER_CAPTURE_DIR, `${id}-menu.png`), (await capturePlayerPage(wc)).toPNG());
      await execute("[...document.querySelectorAll('.queue-song-menu [role=menuitem]')].find(item => item.textContent === 'Move down').click()");
      await waitFor(`document.querySelector('.queue-list li:nth-child(2)')?.dataset.queueId === ${JSON.stringify(queueBefore.items[0].id)}`);
      await waitFor("document.querySelector('.queue-sr-only[role=status]').textContent.includes('moved to position 2')");
      assert.equal(await execute("document.activeElement.closest('li').dataset.queueId"), queueBefore.items[0].id, `${id} reorder lost focus`);
      assert.equal(await youtube.webContents.executeJavaScript("testPlayer.playerQueue().items.find(item => item.current).id"), queueBefore.items.find((item: any) => item.current).id);
      await execute("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))");
      await waitFor(`document.querySelector('.queue-list li:first-child')?.dataset.queueId === ${JSON.stringify(queueBefore.items[0].id)}`);
      // Real pointer capture: drag from the song title area to row three.
      const dragPoints = await execute("(() => { const grip = document.querySelector('.queue-play').getBoundingClientRect(); const row = document.querySelector('.queue-list li:nth-child(3)').getBoundingClientRect(); return { x: Math.round(grip.x + grip.width / 2), from: Math.round(grip.y + grip.height / 2), to: Math.round(row.bottom - 3) }; })()");
      wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: dragPoints.x, y: dragPoints.from });
      wc.sendInputEvent({ type: 'mouseMove', x: dragPoints.x, y: dragPoints.to });
      await delay(30);
      await execute("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
      wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: dragPoints.x, y: dragPoints.to });
      await delay(30);
      assert.deepEqual(await youtube.webContents.executeJavaScript("testPlayer.playerQueue().items.map(item => item.id)"), queueBefore.items.map((item: any) => item.id), "Escape committed a cancelled drag");
      wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: dragPoints.x, y: dragPoints.from });
      wc.sendInputEvent({ type: 'mouseMove', x: dragPoints.x, y: dragPoints.to });
      await delay(30);
      assert.ok(await execute("!!document.querySelector('.queue-drop-before, .queue-drop-after')"), `${id} missing drag marker`);
      wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: dragPoints.x, y: dragPoints.to });
      await waitFor(`document.querySelector('.queue-list li:nth-child(3)')?.dataset.queueId === ${JSON.stringify(queueBefore.items[0].id)}`);
      assert.equal(await execute("!!document.querySelector('.queue-song-menu')"), false, "Drag release opened song actions");
      assert.equal(await youtube.webContents.executeJavaScript("testPlayer.state.selectionChanges"), selectionsBefore, "Whole-row dragging triggered playback");
      for (let move = 0; move < 2; move++) {
        await execute("document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }))");
        await delay(100);
      }
      await waitFor(`document.querySelector('.queue-list li:first-child')?.dataset.queueId === ${JSON.stringify(queueBefore.items[0].id)}`);
      assert.deepEqual(await youtube.webContents.executeJavaScript("testPlayer.playerQueue().items.map(item => item.id)"), queueBefore.items.map((item: any) => item.id));
      // A normal click on the title still selects the song after whole-row pointer capture.
      for (const position of [2, 1]) {
        const point = await execute(`(() => { const row = document.querySelector('.queue-list li:nth-child(${position}) .queue-play').getBoundingClientRect(); return { x: Math.round(row.x + row.width / 2), y: Math.round(row.y + row.height / 2) }; })()`);
        wc.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: point.x, y: point.y });
        wc.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: point.x, y: point.y });
        await waitFor(`document.querySelector('.queue-list li:nth-child(${position}) .queue-play')?.getAttribute('aria-current') === 'true'`);
      }
      if (!mediaWasOpen) await click("Video panel");
      win.setSize(id === "builtin-classic" ? 460 : id === "builtin-focus" ? 620 : 820, 800);
      await delay(200);
      if (process.env.PLAYER_CAPTURE_DIR)
        writeFileSync(
          join(process.env.PLAYER_CAPTURE_DIR, `${id}.png`),
          (await capturePlayerPage(wc)).toPNG(),
        );
    }
    await execute("document.querySelector('.queue-list li:nth-child(3) button').click()");
    await delay();
    assert.equal(fixture.selected, 2);
    // Spotlight keeps artist imagery separate and the queue scrollable beside real video.
    await appearanceExecute("document.querySelector('input[name=player-skin][value=builtin-spotlight]').click()");
    await waitFor("document.querySelector('.skinned-player')?.dataset.arrangement === 'spotlight'");
    assert.equal(await execute("document.querySelectorAll('.module-media .media-tabs').length"), 0, "Media view buttons duplicate the transport switch");
    await waitFor("!!document.querySelector('.spotlight-backdrop img')");
    assert.ok(await execute("document.querySelector('.spotlight-backdrop img').src !== document.querySelector('.artwork-frame img').src"), "Artist backdrop must be independent of song artwork");
    win.setContentSize(1000, 820);
    await delay(400);
    assert.equal(await execute("!!document.querySelector('.spotlight-backdrop')"), true);
    assert.equal(await execute("!!document.querySelector('.studio-record')"), false);
    assert.ok(await execute("document.querySelector('.slot-queue').getBoundingClientRect().right <= document.querySelector('.slot-media').getBoundingClientRect().left"), "Spotlight queue must be on the left");
    assert.ok(await execute("document.querySelector('.queue-list').scrollHeight > document.querySelector('.queue-list').clientHeight"), "Spotlight queue must scroll");
    await execute("document.querySelector('.queue-list').scrollTop = 150");
    assert.ok(await execute("document.querySelector('.queue-list').scrollTop > 0"));
    writeFileSync('/private/tmp/spotlight-wide.png', (await capturePlayerPage(wc)).toPNG());
    await selectMediaView("video");
    await waitFor("!!document.querySelector('.native-video')");
    await delay(400);
    assert.ok(youtube.getBounds().x > 400, "Spotlight video must replace the right-hand cover");
    writeFileSync('/private/tmp/spotlight-video.png', (await capturePlayerPage(wc)).toPNG());
    await selectMediaView("artwork");
    await waitFor("!document.querySelector('.native-video')");
    await click("Equalizer");
    await waitFor("document.querySelector('.skin-layout').dataset.eq === 'true'");
    await delay(250);
    assert.ok(await execute("document.querySelector('.slot-equalizer').getBoundingClientRect().bottom <= innerHeight + 1"), "Spotlight EQ must fit");
    await click("Equalizer");
    await click("Playlist");
    await waitFor("document.querySelector('.skin-layout').dataset.queue === 'false'");
    await click("Playlist");
    win.setContentSize(460, 900);
    await delay(400);
    assert.ok(await execute("document.querySelector('.slot-queue').getBoundingClientRect().top >= document.querySelector('.slot-transport').getBoundingClientRect().bottom - 1"), "Spotlight compact layout must stack");
    assert.ok(await execute("document.documentElement.scrollWidth <= innerWidth"), "Spotlight must not overflow horizontally");
    writeFileSync('/private/tmp/spotlight-narrow.png', (await capturePlayerPage(wc)).toPNG());
    // Studio uses an independent album layout and reuses the real playback/EQ/video controls.
    await appearanceExecute("document.querySelector('input[name=player-skin][value=builtin-studio]').click()");
    await waitFor("document.querySelector('.skinned-player')?.dataset.arrangement === 'album'");
    assert.equal(await execute("document.querySelectorAll('.module-media .media-tabs').length"), 0, "Media view buttons duplicate the transport switch");
    await waitFor("!!document.querySelector('.studio-record')");
    win.setContentSize(960, 760);
    await delay(300);
    assert.equal(await execute("getComputedStyle(document.querySelector('.studio-playlist-header h2')).fontFamily.includes('Manrope Variable')"), true);
    assert.equal(await execute("document.querySelector('.skin-layout').dataset.eq"), "false");
    assert.ok(await execute("document.querySelector('.slot-media').getBoundingClientRect().right <= document.querySelector('.slot-queue').getBoundingClientRect().left + 1"), "Studio artwork must sit beside the playlist");
    await execute("document.querySelector('.queue-list').scrollTop = 0");
    writeFileSync('/private/tmp/studio-wide.png', (await capturePlayerPage(wc)).toPNG());
    await execute("document.querySelector('.queue-list button.current').click()");
    await waitFor("!!document.querySelector('.transport-row button[aria-label=Play]')");
    assert.equal(fixture.playing, false, "Studio current-row pause did not pause");
    await click("Play");
    await waitFor("!!document.querySelector('.transport-row button[aria-label=Pause]')");
    await execute("window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyE', key:'e', altKey:true, bubbles:true}))");
    await waitFor("document.querySelector('.skin-layout').dataset.eq === 'true'");
    await delay(250);
    assert.ok(await execute("document.querySelector('.slot-equalizer').getBoundingClientRect().bottom <= document.querySelector('.slot-transport').getBoundingClientRect().top + 1"), "Studio EQ must sit above transport");
    writeFileSync('/private/tmp/studio-eq.png', (await capturePlayerPage(wc)).toPNG());
    await execute("window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyV', key:'v', altKey:true, bubbles:true}))");
    await waitFor("!!document.querySelector('.native-video')");
    await selectMediaView("artwork");
    await waitFor("!!document.querySelector('.studio-record')");
    await click("Equalizer");
    await waitFor("document.querySelector('.skin-layout').dataset.eq === 'false'");
    win.setContentSize(360, 760);
    await delay(300);
    assert.equal(await execute("document.documentElement.scrollWidth <= innerWidth"), true, "Studio narrow horizontal overflow");
    assert.ok(await execute("document.querySelector('.slot-media').getBoundingClientRect().bottom <= document.querySelector('.slot-queue').getBoundingClientRect().top + 1"), "Studio narrow panes must stack");
    assert.ok(await execute("document.querySelector('.slot-transport').getBoundingClientRect().bottom <= innerHeight + 1"), "Studio transport clipped");
    writeFileSync('/private/tmp/studio-narrow.png', (await capturePlayerPage(wc)).toPNG());
    await click("Equalizer");
    await waitFor("document.querySelector('.skin-layout').dataset.eq === 'true'");
    await delay(350);
    assert.ok(await execute("document.querySelector('.slot-transport').getBoundingClientRect().bottom <= innerHeight + 1"), "Studio narrow EQ clipped transport");
    assert.ok(await execute("document.querySelector('.queue-list').clientHeight >= 60"), "Studio narrow EQ hid the queue");
    await click("Equalizer");
    await waitFor("document.querySelector('.skin-layout').dataset.eq === 'false'");
    await execute("window.dispatchEvent(new KeyboardEvent('keydown', {code:'KeyQ', key:'q', altKey:true, bubbles:true}))");
    await waitFor("document.querySelector('.skin-layout').dataset.queue === 'false'");
    assert.ok(await execute("document.querySelector('.slot-transport').getBoundingClientRect().height > 0"));
    for (const width of [360, 960]) {
      win.setContentSize(width, 760);
      await delay(300);
      assert.ok(await execute("Math.abs(document.querySelector('.slot-media').getBoundingClientRect().width - innerWidth) <= 1"), "Closed Studio queue left a blank column");
      assert.ok(await execute("document.querySelector('.slot-media').getBoundingClientRect().bottom <= document.querySelector('.slot-transport').getBoundingClientRect().top + 1"), "Expanded media overlaps transport");
    }
    writeFileSync('/private/tmp/studio-media-expanded.png', (await capturePlayerPage(wc)).toPNG());
    await selectMediaView("video");
    await waitFor("!!document.querySelector('.native-video')");
    await delay(400);
    assert.ok(Math.abs(youtube.getBounds().width - win.getContentSize()[0]) <= 1, "Native video did not expand with the closed playlist");
    if (process.env.PLAYER_TEST_FULLSCREEN === "1") {
      const beforeWindow = win.getBounds(), beforeVideo = youtube.getBounds();
      const clickFullscreenControl = async () => {
        win.focus(); youtube.webContents.focus();
        const point = await youtube.webContents.executeJavaScript("(() => { const r = document.querySelector('[data-sweetspot-video-controls] button').getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()");
        youtube.webContents.sendInputEvent({type: "mouseMove", movementX: 1, movementY: 1, ...point});
        await delay(200);
        youtube.webContents.sendInputEvent({type: "mouseDown", button: "left", clickCount: 1, ...point});
        youtube.webContents.sendInputEvent({type: "mouseUp", button: "left", clickCount: 1, ...point});
      };
      const fullscreen = async (enabled: boolean) => {
        for (let i = 0; i < 80; i++) {
          if (win.isFullScreen() === enabled && await youtube.webContents.executeJavaScript("!!document.fullscreenElement") === enabled) { await delay(400); return; }
          await delay(100);
        }
        throw new Error(`Studio fullscreen did not become ${enabled}`);
      };
      const toggles = await youtube.webContents.executeJavaScript("window.videoToggleCount");
      await clickFullscreenControl();
      await fullscreen(true);
      assert.deepEqual(youtube.getBounds(), {x: 0, y: 0, width: win.getContentSize()[0], height: win.getContentSize()[1]});
      youtube.webContents.sendInputEvent({type: "keyDown", keyCode: "Escape"});
      youtube.webContents.sendInputEvent({type: "keyUp", keyCode: "Escape"});
      await fullscreen(false);
      assert.deepEqual(win.getBounds(), beforeWindow, "Studio fullscreen changed window bounds");
      assert.deepEqual(youtube.getBounds(), beforeVideo, "Studio fullscreen did not restore expanded video");
      assert.equal(await youtube.webContents.executeJavaScript("window.videoToggleCount"), toggles, "Studio fullscreen button toggled playback");
      await clickFullscreenControl();
      await fullscreen(true);
      await playerMode().setVideo(null);
      await delay(200);
      assert.equal(await youtube.webContents.executeJavaScript("!!document.fullscreenElement"), true, "A stale hidden-pane update closed fullscreen");
      assert.equal(youtube.getVisible(), true, "A stale hidden-pane update hid fullscreen video");
      youtube.webContents.sendInputEvent({type: "keyDown", keyCode: "Escape"});
      youtube.webContents.sendInputEvent({type: "keyUp", keyCode: "Escape"});
      await fullscreen(false);
      assert.deepEqual(youtube.getBounds(), beforeVideo, "Fullscreen button did not restore the video pane");
    }
    await selectMediaView("artwork");

    await click("Playlist");
    win.setContentSize(820, 800);
    // The same real EQ UI writes to the existing preview/commit routers.
    await appearanceExecute("document.querySelector('input[name=player-skin][value=builtin-sleeve]').click()");
    await waitFor("document.querySelector('.player-brand').textContent.includes('Sleeve')");
    await delay(200);
    await click("Equalizer");
    const wideSections = await execute(
      "(()=>{const video=document.querySelector('.slot-media').getBoundingClientRect(),queue=document.querySelector('.slot-queue').getBoundingClientRect(),layout=document.querySelector('.skin-layout').getBoundingClientRect();return {videoBottom:video.bottom,queueTop:queue.top,videoWidth:video.width,layoutWidth:layout.width}})()",
    );
    assert.ok(
      wideSections.videoBottom <= wideSections.queueTop,
      "Wide column skin put video beside playlist",
    );
    assert.equal(wideSections.videoWidth, wideSections.layoutWidth);
    assert.equal(
      await execute(
        "document.querySelector('.module-transport').getBoundingClientRect().bottom <= document.querySelector('.slot-media').getBoundingClientRect().top",
      ),
      true,
      "Video overlaps transport with wide EQ",
    );
    assert.equal(
      await execute(
        "document.querySelector('.slot-queue').getBoundingClientRect().bottom <= innerHeight+1",
      ),
      true,
      "Wide playlist extends beyond window",
    );
    assert.equal(
      await execute(
        "document.querySelector('.slot-equalizer').scrollHeight > document.querySelector('.slot-equalizer').clientHeight+1",
      ),
      false,
      "Wide EQ scrolls",
    );

    await execute(
      `(()=>{const s=document.querySelector('[data-testid=equalizer-panel] input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(s,'4');s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));})()`,
    );
    await delay(800);
    assert.equal((data.equalizer as any).gains[0], 4);
    assert.equal("importSkin" in playerRouter._def.procedures, false);
    assert.equal("exportSkin" in playerRouter._def.procedures, false);
    assert.equal(
      await appearanceExecute("[...document.querySelectorAll('button')].some(b=>/Import skin|Export skin starter/.test(b.textContent))"),
      false,
      "Skin import and export controls must not be available",
    );
    // Main-side enforcement: do not rely on the renderer's filtering.
    const restrictedCaller = router({ settings: settingsRouter }).createCaller({
      event: { sender: wc },
      getProvider: () => settings,
      getBrowserWindow: () => win,
      authorizeProcedure: (path) => authorizePlayer(wc, path),
    });
    await assert.rejects(() => restrictedCaller.settings.get({ key: "account" }));
    await assert.rejects(() => restrictedCaller.settings.getAll());
    await wc.executeJavaScript(
      "document.querySelector('.media-tabs button:nth-of-type(2)').click()",
      true,
    );
    await delay(250);
    assert.equal(youtube.getVisible(), true);
    assert.equal(
      await youtube.webContents.executeJavaScript("getComputedStyle(nativeTestVideo).visibility"),
      "visible",
    );
    assert.ok(
      await youtube.webContents.executeJavaScript(
        "nativeTestVideo.getBoundingClientRect().width>0 && nativeTestVideo.getBoundingClientRect().height>0",
      ),
    );
    assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), true);
    const nativeTime = await youtube.webContents.executeJavaScript("nativeTestVideo.currentTime");
    assert.ok(nativeTime > 0);
    await click("Always on top");
    assert.equal(win.isAlwaysOnTop(), true);
    const fullMenu = Menu.getApplicationMenu()!.getMenuItemById("sweetspot-full-mode")!;
    fullMenu.click!(fullMenu, win, {} as any);
    await delay(300);
    await delay(300);
    assert.equal(playerMode().active, false);
    assert.equal(await youtube.webContents.executeJavaScript("document.documentElement.style.getPropertyValue('--sweetspot-video-quality-width')"), '', 'Quality geometry leaked into full mode');

    assert.equal(backgroundWrites.at(-1), originalWindowBackground);
    assert.equal(await trayCaller.mode(), false);
    assert.deepEqual(trayModes, [false, true, false]);
    assert.equal(Menu.getApplicationMenu()?.getMenuItemById("sweetspot-full-mode")?.checked, true);
    if (process.platform === "darwin") assert.equal(buttonVisibility.at(-1), true);
    assert.equal(fullLayouts, 1);
    assert.deepEqual(win.getBounds(), bounds);
    assert.equal(fixture.progress, 102);
    assert.equal((data.equalizer as any).gains[0], 4);
    assert.equal(
      await youtube.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('body > div')).visibility",
      ),
      "visible",
    );
    assert.equal(win.isAlwaysOnTop(), false);
    const playerMenu = Menu.getApplicationMenu()!.getMenuItemById("sweetspot-player-mode")!;
    playerMenu.click!(playerMenu, win, {} as any);
    await delay(500);
    await delay(400);
    assert.equal(playerMode().senderId, wc.id);
    assert.equal(await trayCaller.mode(), true);
    assert.deepEqual(trayModes, [false, true, false, true]);
    assert.equal(win.isAlwaysOnTop(), true);
    assert.equal(youtube.getVisible(), true, "Video reconnects on player re-entry");
    assert.equal(
      await youtube.webContents.executeJavaScript(
        "nativeTestVideo === document.querySelector('video') && !nativeTestVideo.paused",
      ),
      true,
    );
    assert.ok(
      (await youtube.webContents.executeJavaScript("nativeTestVideo.currentTime")) > nativeTime,
    );
    await selectMediaView("artwork");
    await delay(200);
    assert.equal(await youtube.webContents.executeJavaScript("window.videoModeRequested"), false);
    await execute("document.querySelector('.queue-list li:nth-child(2) .queue-menu-trigger').click()");
    await waitFor("!!document.querySelector('.queue-song-menu')");
    await execute("[...document.querySelectorAll('.queue-song-menu [role=menuitem]')].find(item => item.textContent === 'Play now').click()");
    await waitFor("document.querySelector('.queue-list li:nth-child(2) .queue-play')?.getAttribute('aria-current') === 'true'");
    const playNextId = await youtube.webContents.executeJavaScript("testPlayer.playerQueue().items[4].id");
    await execute("document.querySelector('.queue-list li:nth-child(5) .queue-menu-trigger').click()");
    await waitFor("!!document.querySelector('.queue-song-menu')");
    await execute("[...document.querySelectorAll('.queue-song-menu [role=menuitem]')].find(item => item.textContent === 'Play next').click()");
    await waitFor("!document.querySelector('.queue-song-menu')");
    await delay(150);
    const queueAfterNext = await youtube.webContents.executeJavaScript("testPlayer.playerQueue()");
    assert.equal(queueAfterNext.items[queueAfterNext.items.findIndex((item: any) => item.current) + 1].id, playNextId, "Play next chose the wrong queue occurrence");
    const removeId = queueAfterNext.items[queueAfterNext.items.length - 1].id;
    await execute("document.querySelector('.queue-list li:last-child').scrollIntoView(); document.querySelector('.queue-list li:last-child .queue-menu-trigger').click()");
    await waitFor("!!document.querySelector('.queue-song-menu')");
    await execute("[...document.querySelectorAll('.queue-song-menu [role=menuitem]')].find(item => item.textContent === 'Remove from queue').click()");
    await waitFor(`!document.querySelector('.queue-list li[data-queue-id="${removeId}"]')`);
    assert.equal(await youtube.webContents.executeJavaScript("testPlayer.playerQueue().count"), queueAfterNext.count - 1);
    const persistedQueue = await youtube.webContents.executeJavaScript("testPlayer.playerQueue()");
    const moveForFullMode = persistedQueue.items[4];
    await trayCaller.moveQueue({ id: moveForFullMode.id, revision: moveForFullMode.revision, toIndex: 1 });
    const reorderedQueue = await youtube.webContents.executeJavaScript("testPlayer.playerQueue()");
    await trayCaller.fullMode();
    assert.deepEqual(await youtube.webContents.executeJavaScript("testPlayer.playerQueue()"), reorderedQueue, "Returning to full mode changed the reordered native queue");
    assert.equal(await youtube.webContents.executeJavaScript("document.querySelector('.song-button').getAttribute('aria-pressed')"), "true", "Full mode returned to hidden video playback");
    assert.equal(await trayCaller.mode(), false);
    assert.deepEqual(trayModes, [false, true, false, true, false]);
    trayModeSubscription.unsubscribe();
    assert.deepEqual(win.getBounds(), bounds);
    console.log(
      `PASS: production sandbox preload and UI; selected built-in skins including Pop; Spotlight artist backdrop, left queue scrolling, right video and compact layout; Studio split/stack layout, Manrope typography, EQ drawer and keyboard shortcuts; persistent video mouse toggling; independent resizing of each visible panel; SVG spectrum and segmented clock; Classic EQ in the second row; window-width scaling; adjacent panels; full EQ without scrolling; vertically resizable video; full-width video sections; headless player and native menu mode switching; independent Settings movement; independent Apply/Cancel/Reset; 360/460/820 fixed frames at minimum height and keyboard playlist scrolling; queue occurrence playback; EQ write; commented export and import; main-side settings restrictions; native video continuity, hide/show and re-entry; HD/display-sized adaptive controller with pane-sized video and full-mode cleanup; ${process.env.PLAYER_TEST_FULLSCREEN === "1" ? "native video fullscreen checks;" : "fullscreen checks skipped;"} full-mode bounds/pin/session restoration.`,
    );
    clearTimeout(timeout);
    settingsWindow.destroy();
    win.destroy();
    app.exit(0);
  } catch (e) {
    console.error(e);
    clearTimeout(timeout);
    app.exit(1);
  }
});
