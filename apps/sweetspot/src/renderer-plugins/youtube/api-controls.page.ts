import { currentArtistArtwork } from "./artist-artwork.page";
import { setSkinVideoPresentation, requestSkinVideoMode, cancelSkinVideoModePause } from "./player-video.page";
import { playerQueue, playQueueOccurrence, moveQueueOccurrence, queueOccurrenceAction } from "./player-queue.page";
import { attachEqualizer, equalizerAudio } from "./equalizer.page";
import { definePageCmds } from "@plugins/define-bridge";
import { trackControls } from "./api-controls.cmds";
import { getPagePlayerApi } from "./world0/context";

function requirePlayer() {
	const player = getPagePlayerApi();
	if (!player) throw new Error("playerApi not ready");
	return player;
}

/** All app shortcuts/media keys share this entry point. */
export function runPlaybackControl(kind: "toggle" | "play" | "pause" | "next" | "prev") {
  cancelSkinVideoModePause();
  const player = requirePlayer();
  attachEqualizer();
  const snapshot = (result: unknown) =>
    result && typeof result === "object" && "cancelled" in result
      ? { isPlaying: player.getPlayerState() === 1, time: player.getCurrentTime() }
      : result;
  if (kind === "toggle") {
    const pause =
      (equalizerAudio.localPlaying ?? player.getPlayerState() === 1) && !equalizerAudio.pendingPause;
    return equalizerAudio
      .transport(pause ? "pause" : "play", () =>
        pause ? trackControls.pause(player) : trackControls.play(player),
      )
      .then(snapshot);
  }
  return equalizerAudio
    .transport(kind === "next" || kind === "prev" ? "skip" : kind, () => trackControls[kind](player))
    .then(snapshot);
}

/**
 * Page cmd handlers + bridge for api-controls.
 * Safe in world0 (no electron / preload).
 */
export const apiControlsPage = definePageCmds({
	name: "api_controls",
	cmds: {
		toggle: () => runPlaybackControl("toggle"),
		play: () => runPlaybackControl("play"),
		pause: () => runPlaybackControl("pause"),
		next: () => runPlaybackControl("next"),
		prev: () => runPlaybackControl("prev"),
		isPlaying: () => trackControls.isPlaying(requirePlayer()),
		repeat: () => trackControls.repeat(requirePlayer()),
		shuffle: () => trackControls.shuffle(requirePlayer()),
		forward: (data) => trackControls.forward(requirePlayer(), data as Parameters<typeof trackControls.forward>[1]),
		backward: (data) =>
			trackControls.backward(requirePlayer(), data as Parameters<typeof trackControls.backward>[1]),
		seek: (data) => trackControls.seek(requirePlayer(), data as Parameters<typeof trackControls.seek>[1]),
		like: (liked) => trackControls.like(!!liked),
		dislike: (disliked) => trackControls.dislike(!!disliked),
		volume: (data) => trackControls.volume(requirePlayer(), data as Parameters<typeof trackControls.volume>[1]),
		volumeUp: (data) =>
			trackControls.volumeUp(requirePlayer(), data as Parameters<typeof trackControls.volumeUp>[1]),
		volumeDown: (data) =>
			trackControls.volumeDown(requirePlayer(), data as Parameters<typeof trackControls.volumeDown>[1]),
		navigate: (data) => {
          cancelSkinVideoModePause();
          return trackControls.navigate(data as Parameters<typeof trackControls.navigate>[0]);
        },
		queueAdd: (data) => trackControls.queueAdd(data as Parameters<typeof trackControls.queueAdd>[0]),
		queueList: () => trackControls.queueList(),
		skinVideoPresentation: (enabled, pictureFrame) => setSkinVideoPresentation(!!enabled, () => { equalizerAudio.resume(); return runPlaybackControl("toggle"); }, !!pictureFrame),
        skinVideoMode: (enabled = true) => requestSkinVideoMode(enabled !== false, {
          isPlaying: () => equalizerAudio.pendingPause ? false : (equalizerAudio.localPlaying ?? requirePlayer().getPlayerState() === 1),
          pause: () => requirePlayer().pauseVideo(),
        }),
        skinVideoDimensions: () => {
          const video = document.querySelector("video");
          return { width: video?.videoWidth ?? 0, height: video?.videoHeight ?? 0 };
        },
        playerQueue: () => playerQueue(),
        artistArtwork: (input) => currentArtistArtwork(input as { videoId: string; channelId: string; artist?: string }),
		playerQueuePlay: (input) => {
          cancelSkinVideoModePause();
          return playQueueOccurrence(input as {id:string;revision:string});
        },
        playerQueueMove: (input) => moveQueueOccurrence(input as {id:string;revision:string;toIndex:number}),
        playerQueueAction: (input) => queueOccurrenceAction(input as {id:string;revision:string;action:"playNext"|"remove"}),
		queueClear: () => trackControls.queueClear(requirePlayer()),
		videoId: () => {
			const data = requirePlayer().getVideoData?.() as { video_id?: string } | undefined;
			return data?.video_id ?? null;
		},
	},
});

export type ApiControlCmd = keyof typeof apiControlsPage.cmds;

export const API_CONTROLS_MSG = apiControlsPage.type;

/** Preload / other plugins: ask page world to run a track control cmd. */
export function requestApiControl<T = unknown>(cmd: ApiControlCmd, ...args: unknown[]): Promise<T> {
	return apiControlsPage.bridge.request<T>(cmd, ...args);
}

export const apiControlPluginCmds = apiControlsPage.pluginCmds;
