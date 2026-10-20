import { DEFAULT_PLAYBACK_TRANSITIONS } from "../src/shared/playback-transitions";
import { app, BrowserWindow, ipcMain } from "electron";
import { createIPCHandler } from "electron-trpc/main";
import { Subject } from "rxjs";
import { createYmlStore } from "../src/main/lib/store/createYmlStore";
import { settingsRouter } from "../src/main/trpc/routers/settings/router";
import { equalizerRouter } from "../src/main/trpc/routers/equalizer/router";
import { router } from "../src/shared/trpc/trpc";
import { defaultEqSettings, type EqSettings } from "../src/shared/equalizer";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

app.whenReady().then(async () => {
  const directory = path.dirname(process.argv[1]);
  // Upgrade an existing installation that predates the new preference.
  const legacy = createYmlStore<{ equalizer: EqSettings }>("eq-integration");
  legacy.set("equalizer", defaultEqSettings());
  const store = createYmlStore<{ equalizer: EqSettings }>("eq-integration", {
    defaults: {
      equalizer: defaultEqSettings(),
      player: {
        stableVolumeEnabled: true,
        playbackTransitions: { ...DEFAULT_PLAYBACK_TRANSITIONS },
      },
    } as any,
  });
  if (store.get("player.stableVolumeEnabled" as any) !== true)
    throw new Error("Missing preference did not default on during upgrade");
  const settings = {
    get: (key: string) => store.get(key as "equalizer"),
    set(key: string, value: unknown) {
      const prevValue = store.get(key as "equalizer");
      store.set(key as "equalizer", value as EqSettings);
      this.settingChanged.next({ key, value, prevValue });
      player.webContents.send("settingsProvider.change", key, value);
    },
    saveToDrive() {},
    settingChanged: new Subject<{ key: string; value: unknown; prevValue: unknown }>(),
  };
  ipcMain.handle("test:get", (_event, key) => settings.get(key));
  const options = {
    show: false,
    webPreferences: {
      preload: path.join(directory, "preload.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  };
  const player = new BrowserWindow(options);
  (globalThis as any).equalizerTestPlayer = player;
  await player.loadFile(path.join(directory, "player.html"));
  const ui = new BrowserWindow({ ...options, width: 900, height: 800 });
  const handler = createIPCHandler({
    router: router({ settings: settingsRouter, equalizer: equalizerRouter }),
    createContext: async () => ({
      getProvider: () => settings,
      getBrowserWindow: () => ui,
      event: { sender: ui.webContents },
    }),
  } as any);
  handler.attachWindow(ui);
  const timeout = setTimeout(() => {
    console.error("Equalizer UI integration timed out");
    app.exit(1);
  }, 30000);
  try {
    await ui.loadFile(path.join(directory, "ui.html"));
    if (process.env.EQ_CAPTURE_DIR) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      writeFileSync(
        path.join(process.env.EQ_CAPTURE_DIR, "equalizer-desktop.png"),
        (await ui.webContents.capturePage()).toPNG(),
      );
      ui.setSize(420, 1000);
      settings.set("player.playbackTransitions", {
        ...DEFAULT_PLAYBACK_TRANSITIONS,
        songFades: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      writeFileSync(
        path.join(process.env.EQ_CAPTURE_DIR, "equalizer-narrow.png"),
        (await ui.webContents.capturePage()).toPNG(),
      );
      settings.set("player.playbackTransitions", { ...DEFAULT_PLAYBACK_TRANSITIONS });
      await new Promise((resolve) => setTimeout(resolve, 100));
      ui.setSize(900, 800);
    }
    const result = await ui.webContents.executeJavaScript("window.runEqualizerUiChecks()", true);
    const restarted = createYmlStore<{ equalizer: EqSettings }>("eq-integration");
    if (JSON.stringify(restarted.get("equalizer")) !== JSON.stringify(result.saved))
      throw new Error("Preset persistence failed on store reopen");
    if (restarted.get("player.stableVolumeEnabled" as any) !== false)
      throw new Error("Consistent volume off preference failed on store reopen");
    const stableEnabled = await player.webContents.executeJavaScript(
      "window.equalizerTestAudio.stableVolumeEnabled",
    );
    if (stableEnabled !== false)
      throw new Error("Consistent volume setting did not reach the playback controller");
    const fades = restarted.get("player.playbackTransitions" as any) as any;
    if (
      fades.smoothPlayPause !== false ||
      fades.songFades !== true ||
      fades.songFadeSeconds !== 2.5
    )
      throw new Error("Transition choices failed on store reopen");
    const pageFades = await player.webContents.executeJavaScript(
      "window.equalizerTestAudio.fadeConfig",
    );
    if (JSON.stringify(pageFades) !== JSON.stringify(fades))
      throw new Error("Transition preferences did not reach the playback controller");
    console.log(JSON.stringify({ ...result, persistence: "passed", ipcBridge: "passed" }, null, 2));
    if (process.env.EQ_LIVE_CHECK === "1") {
      settings.set("equalizer", { ...store.get("equalizer"), enabled: false });
      settings.set("player.stableVolumeEnabled", true);
      settings.set("player.playbackTransitions", {
        ...DEFAULT_PLAYBACK_TRANSITIONS,
        songFades: true,
      });
      await player.loadURL("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
      await player.webContents.executeJavaScript(
        readFileSync(path.join(directory, "player.js"), "utf8"),
        true,
      );
      let live: any;
      for (let i = 0; i < 20; i++) {
        live = await player.webContents.executeJavaScript(
          `(() => {
				 const video = document.querySelector('video');
				 if (video) { video.volume = 0.01; }
				 window.getTestPlayerApi()?.playVideo?.();
				 const engine = window.equalizerTestAudio;
				 engine.resume();
				 let rms = 0;
				 if (engine.active) {
				  if (!window.eqTestAnalyser) { window.eqTestAnalyser = engine.context.createAnalyser(); engine.active.fades.gain.connect(window.eqTestAnalyser); }
				  const samples = new Float32Array(window.eqTestAnalyser.fftSize); window.eqTestAnalyser.getFloatTimeDomainData(samples);
				  rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
				 }
				 return { stableActive: engine.stableVolumeEnabled && engine.active?.stable.wet.gain.value === 1, reductionDb: engine.active?.stable.dynamics.reduction, status: engine.status(), hasMedia: !!video, sourceType: video?.currentSrc.split(':')[0] || 'none', rms };
				})()`,
          true,
        );
        if (live.stableActive === true && live.rms > 1e-7) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      console.log("Live YouTube playback", JSON.stringify(live));
      const transport = await player.webContents.executeJavaScript(
        `(async () => {
        const media = document.querySelector('video');
        const engine = window.equalizerTestAudio;
        const button = document.querySelector('ytmusic-player-bar #play-pause-button');
        if (!button) throw new Error('Native YouTube Music play/pause button not found');
        button.click();
        const beforeFade = media.paused;
        await new Promise(resolve => setTimeout(resolve, 200));
        const afterFade = media.paused;
        button.click();
        await new Promise(resolve => setTimeout(resolve, 250));
        const resumed = !media.paused;
        if (beforeFade || !afterFade || !resumed) throw new Error('Native UI faded pause/resume failed: ' + JSON.stringify({beforeFade, afterFade, resumed, hasFade: engine.hasFadeProcessing, pending: engine.pendingPause, sameMedia: engine.media === media, fadeConfig: engine.fadeConfig, apiState: window.getTestPlayerApi()?.getPlayerState(), button: button.outerHTML.slice(0, 800)}));
        const oldPause = window.runTestPlaybackControl('pause');
        await new Promise(resolve => setTimeout(resolve, 20));
        await window.runTestPlaybackControl('toggle');
        const cancelled = await oldPause;
        await new Promise(resolve => setTimeout(resolve, 150));
        if (media.paused || engine.active.fades.gain.gain.value < .99 || typeof cancelled.isPlaying !== 'boolean') throw new Error('App control rapid toggle failed');
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 200));
        if (!media.paused) throw new Error('Keyboard pause fade failed');
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
        await new Promise(resolve => setTimeout(resolve, 250));
        if (media.paused || engine.active.fades.gain.gain.value < .99) throw new Error('Keyboard resume fade failed');
        return { nativeControlFade: 'passed', appControlRapidToggle: 'passed', keyboardFades: 'passed', gain: engine.active.fades.gain.gain.value };
      })()`,
        true,
      );
      console.log("Live transport", JSON.stringify(transport));
      if (live.stableActive !== true || live.rms <= 1e-7)
        throw new Error("Live YouTube playback could not be verified");
    }
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
