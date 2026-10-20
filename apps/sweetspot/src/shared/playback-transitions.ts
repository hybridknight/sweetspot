export const PLAYBACK_TRANSITIONS_SETTING = "player.playbackTransitions";
export const DEFAULT_PLAYBACK_TRANSITIONS = {
  smoothPlayPause: true,
  songFades: false,
  songFadeSeconds: 1,
};
export type PlaybackTransitions = typeof DEFAULT_PLAYBACK_TRANSITIONS;

export function readPlaybackTransitions(raw: unknown): PlaybackTransitions {
  const value = raw && typeof raw === "object" ? (raw as Partial<PlaybackTransitions>) : {};
  return {
    smoothPlayPause: typeof value.smoothPlayPause === "boolean" ? value.smoothPlayPause : true,
    songFades: typeof value.songFades === "boolean" ? value.songFades : false,
    songFadeSeconds:
      typeof value.songFadeSeconds === "number" && Number.isFinite(value.songFadeSeconds)
        ? Math.max(0.5, Math.min(5, value.songFadeSeconds))
        : 1,
  };
}
