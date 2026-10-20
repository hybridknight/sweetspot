import { installFadedControls } from "./equalizer/transport-controls";
import {
  DEFAULT_PLAYBACK_TRANSITIONS,
  PLAYBACK_TRANSITIONS_SETTING,
  readPlaybackTransitions,
} from "@shared/playback-transitions";
import { STABLE_VOLUME_SETTING, readStableVolumeEnabled } from "@shared/stable-volume";
import { readEqSettings } from "@shared/equalizer";
import { attachEqualizer, equalizerAudio, equalizerPage, stopSpectrumStream } from "./equalizer.page";
import type { RendererPluginRegistration } from "./world0/types";

const renderer: RendererPluginRegistration = {
  id: "equalizer",
  enabled: true,
  async start(ctx) {
    // Wait for the saved preference before any default-on capture.
    equalizerAudio.setStableVolume(false);
    equalizerAudio.setFadeConfig({ ...DEFAULT_PLAYBACK_TRANSITIONS, smoothPlayPause: false });
    const offControls = installFadedControls((error) =>
      ctx.log.warn("Playback control failed", error),
    );
    const offBridge = equalizerPage.listen(ctx.log);
    let revision = 0;
    let stableRevision = 0;
    let fadeRevision = 0;
    const offSettings = ctx.sweetspot?.on("settingsProvider.change", (key, value) => {
      if (key === PLAYBACK_TRANSITIONS_SETTING) {
        fadeRevision++;
        equalizerAudio.setFadeConfig(readPlaybackTransitions(value));
        attachEqualizer();
        return;
      }
      if (key === STABLE_VOLUME_SETTING) {
        stableRevision++;
        equalizerAudio.setStableVolume(readStableVolumeEnabled(value));
        attachEqualizer();
        return;
      }
      if (key !== "equalizer") return;
      revision++;
      equalizerAudio.setConfig(readEqSettings(value));
      attachEqualizer();
    });
    const onCast = (ev: Event) => {
      equalizerAudio.setCast(
        (ev as CustomEvent<{ connected?: boolean }>).detail?.connected === true,
      );
      attachEqualizer();
    };
    const onGesture = () => {
      equalizerAudio.resume(attachEqualizer);
      attachEqualizer();
    };
    window.addEventListener("sweetspot-cast-session", onCast);
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("canplay", attachEqualizer, true);
    document.addEventListener("playing", attachEqualizer, true);
    // Lightweight polling handles replacement elements without observing every YouTube DOM mutation.
    const timer = window.setInterval(attachEqualizer, 1000);
    const initialRevision = revision;
    const initialStableRevision = stableRevision;
    const initialFadeRevision = fadeRevision;
    const [saved, stable, fades] = await Promise.allSettled([
      ctx.sweetspot?.settings.get("equalizer"),
      ctx.sweetspot?.settings.get(STABLE_VOLUME_SETTING),
      ctx.sweetspot?.settings.get(PLAYBACK_TRANSITIONS_SETTING),
    ]);
    if (fades.status === "fulfilled" && fadeRevision === initialFadeRevision)
      equalizerAudio.setFadeConfig(readPlaybackTransitions(fades.value));
    if (stable.status === "fulfilled" && stableRevision === initialStableRevision)
      equalizerAudio.setStableVolume(readStableVolumeEnabled(stable.value));
    if (saved.status === "fulfilled" && revision === initialRevision)
      equalizerAudio.setConfig(readEqSettings(saved.value));
    for (const result of [saved, stable, fades])
      if (result.status === "rejected") ctx.log.warn("Audio settings unavailable", result.reason);
    equalizerAudio.setCast(
      (window as Window & { __sweetspotCastConnected?: boolean }).__sweetspotCastConnected === true,
    );
    attachEqualizer();
    return () => {
      offControls();
      offBridge();
      offSettings?.();
      window.clearInterval(timer);
      window.removeEventListener("sweetspot-cast-session", onCast);
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("canplay", attachEqualizer, true);
      document.removeEventListener("playing", attachEqualizer, true);
      stopSpectrumStream();
      equalizerAudio.bypass();
    };
  },
};
export default renderer;
