// Record native gestures before the presentation interceptors for failure diagnostics.
(window as any).videoGestures = [];
for (const type of ["click", "dblclick"]) window.addEventListener(type, (event: MouseEvent) => {
  (window as any).videoGestures.push({ type, detail:event.detail, fullscreen:!!document.fullscreenElement, target:(event.target as Element)?.tagName });
}, true);
import {
  playerQueue,
  playQueueOccurrence,
  moveQueueOccurrence,
  queueOccurrenceAction,
} from "../src/renderer-plugins/youtube/player-queue.page";
import {
  setSkinVideoPresentation,
  requestSkinVideoMode,
  cancelSkinVideoModePause,
} from "../src/renderer-plugins/youtube/player-video.page";
const state = { selected: 0, selectionChanges: 0 };
const entries = Array.from({ length: 100 }, (_, index) => ({
  playlistPanelVideoWrapperRenderer: {
    primaryRenderer: {
      playlistPanelVideoRenderer: {
        videoId: index === 1 ? "b" : "a",
        playlistSetVideoId: `occurrence-${index}`,
        title: { simpleText: ["After the Rain", "Neon Streets"][index % 2] },
        shortBylineText: { simpleText: "Northbound" },
        lengthText: { simpleText: "4:26" },
        navigationEndpoint: {
          watchEndpoint: { videoId: index === 1 ? "b" : "a", playlistId: "test-playlist", index },
        },
        queueNavigationEndpoint: { queueAddEndpoint: {} },
        selected: index === 0,
      },
    },
  },
}));
let playlistTitle: string | null = "Northbound Favorites";
(window as any).__SWEETSPOT_HOOK__ = {
  ytmStore: {
    // Real store snapshots may recreate wrappers: native occurrence IDs must survive this.
    getState: () => ({
      queue: {
        items: structuredClone(entries),
        header: { title: { runs: [{ text: "Playing from" }] }, subtitle: { runs: [{ text: playlistTitle }] } },
      },
    }),
    dispatch() {},
  },
};
const queueHost = document.createElement("div");
queueHost.id = "queue";
(queueHost as any).dispatch = (action: { type: string; payload: any }) => {
  if (action.type === "MOVE_ITEM") {
    const [entry] = entries.splice(action.payload.fromIndex, 1);
    entries.splice(action.payload.toIndex, 0, entry);
    state.selected = entries.findIndex(entry => entry.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected);
  } else if (action.type === "SET_INDEX") {
    state.selectionChanges++;
    state.selected = action.payload;
    entries.forEach((entry, index) => { entry.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected = index === state.selected; });
  } else if (action.type === "REMOVE_ITEM") {
    const [removed] = entries.splice(action.payload, 1);
    if (removed.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected && entries.length) {
      entries[Math.min(action.payload, entries.length - 1)].playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected = true;
    }
    state.selected = entries.findIndex(entry => entry.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected);
  }
};
document.body.append(queueHost);
document.addEventListener("yt-navigate", (event: Event) => {
  const endpoint = (event as CustomEvent).detail.endpoint.watchEndpoint;
  if (endpoint.playlistId !== "test-playlist") throw new Error("Lost playlist context");
  state.selected = endpoint.index;
  entries.forEach(
    (e, i) =>
      (e.playlistPanelVideoWrapperRenderer.primaryRenderer.playlistPanelVideoRenderer.selected =
        i === state.selected),
  );
});
for (const [selector, enabled] of [[".video-button", true], [".song-button", false]] as const) {
  (document.querySelector(selector) as HTMLElement).onclick = () => {
    (window as any).videoModeRequested = enabled;
    document.querySelector(".video-button")!.setAttribute("aria-pressed", String(enabled));
    document.querySelector(".song-button")!.setAttribute("aria-pressed", String(!enabled));
    if ((window as any).autoPlayOnModeSwitch) {
      if ((window as any).pauseOnModeSwitch) document.querySelector("video")!.pause();
      else void document.querySelector("video")!.play();
      setTimeout(() => void document.querySelector("video")!.play(), (window as any).modeSwitchDelay ?? 80);
    }
  };
}
(window as any).videoModeRequested = false;
Object.assign(window, {
  testPlayer: {
    setPlaylistTitle: (title: string | null) => { playlistTitle = title; },
    playerQueue,
    playQueueOccurrence,
    moveQueueOccurrence,
    queueOccurrenceAction,
    setSkinVideoPresentation: (enabled: boolean, pictureFrame = false) =>
      setSkinVideoPresentation(enabled, () => {
        const video = document.querySelector("video")!;
        (window as any).videoToggleCount = ((window as any).videoToggleCount || 0) + 1;
        return video.paused ? video.play() : video.pause();
      }, pictureFrame),
    requestSkinVideoMode,
    cancelSkinVideoModePause,
    state,
  },
});

// Mimic the site's conflicting native click handler. Skin mode must intercept before this.
document.addEventListener("click", (event) => {
  if (event.target !== document.querySelector("video")) return;
  (window as any).siteVideoClicks = ((window as any).siteVideoClicks || 0) + 1;
  const video = document.querySelector("video")!;
  video.pause();
  setTimeout(() => void video.play(), 80);
});
