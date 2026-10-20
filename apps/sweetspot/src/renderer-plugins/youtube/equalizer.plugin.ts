import definePlugin from "@plugins/utils";
import { equalizerPage } from "./equalizer.page";
import renderer from "./equalizer.renderer";

export default definePlugin(
  "equalizer",
  { enabled: true, displayName: "Equalizer" },
  { renderer, cmds: equalizerPage.pluginCmds },
);
