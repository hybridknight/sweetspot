import { getPagePlayerApi } from "../src/renderer-plugins/youtube/world0/context";
import { runPlaybackControl } from "../src/renderer-plugins/youtube/api-controls.page";
import renderer from "../src/renderer-plugins/youtube/equalizer.renderer";
import { equalizerAudio } from "../src/renderer-plugins/youtube/equalizer.page";
(window as any).equalizerTestAudio = equalizerAudio;
(window as any).runTestPlaybackControl = runPlaybackControl;
(window as any).getTestPlayerApi = getPagePlayerApi;
void renderer.start!({
  name: "equalizer",
  sweetspot: (window as any).sweetspot,
  log: { debug() {}, info() {}, warn() {}, error() {} },
});
