import { runPlaybackControl } from "../api-controls.page";
import { equalizerAudio } from "../equalizer.page";
import { getPagePlayerApi } from "../world0/context";

/** Intercept user controls only. Site/system pauses (ads, navigation, errors) stay immediate. */
export function installFadedControls(onError: (error: unknown) => void): () => void {
  const run = (kind: "toggle" | "next" | "prev", event: Event) => {
    if (!equalizerAudio.hasFadeProcessing || !getPagePlayerApi()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void runPlaybackControl(kind).catch(onError);
  };
  const click = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0) return;
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue;
      if (node.closest("[disabled], [aria-disabled='true']")) return;
      if (node.matches("ytmusic-player-bar #play-pause-button, #movie_player .ytp-play-button")) {
        run("toggle", event);
        return;
      }
      if (node.matches("ytmusic-player-bar #next-button")) {
        run("next", event);
        return;
      }
      if (node.matches("ytmusic-player-bar #previous-button")) {
        run("prev", event);
        return;
      }
    }
  };
  const key = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (event.key !== " " && event.key.toLowerCase() !== "k") return;
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest(
        "input, textarea, select, button, a, [contenteditable], [role='button'], [role='switch'], [role='checkbox'], [role='tab'], tp-yt-paper-icon-button, [role='textbox'], [role='slider'], [role='combobox'], [role='menuitem']",
      )
    )
      return;
    run("toggle", event);
  };
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
  return () => {
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
  };
}
