import { definePageCmds } from "@plugins/define-bridge";
import { SpectrumStream } from "./equalizer/spectrum-stream";
import { SPECTRUM_CHANNEL } from "@shared/skins/spectrum";
import { EqualizerAudio } from "./equalizer/audio";

export const equalizerAudio = new EqualizerAudio();
const spectrumStream = new SpectrumStream(
  () => equalizerAudio.spectrum(),
  (frame) => window.sweetspot?.emit(SPECTRUM_CHANNEL, frame),
);
export function stopSpectrumStream(): void {
  spectrumStream.setEnabled(false);
  equalizerAudio.setVisualizationEnabled(false);
}
export function attachEqualizer(): void {
  const media = document.querySelector<HTMLVideoElement>(
    "#movie_player video.html5-main-video, ytmusic-player video, video.html5-main-video",
  );
  equalizerAudio.attach(media);
}
export const equalizerPage = definePageCmds({
  name: "equalizer",
  cmds: {
    spectrum: (enabled: unknown, stream: unknown = false) => {
      equalizerAudio.setVisualizationEnabled(enabled === true);
      if (enabled) attachEqualizer();
      spectrumStream.setEnabled(enabled === true && stream === true);
      return equalizerAudio.spectrum();
    },
    preview: (config: unknown) => {
      equalizerAudio.setConfig(config);
      attachEqualizer();
      return equalizerAudio.status();
    },
    status: () => {
      attachEqualizer();
      return equalizerAudio.status();
    },
  },
});
