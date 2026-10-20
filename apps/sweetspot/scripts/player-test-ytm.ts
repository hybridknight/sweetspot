import { defaultEqSettings } from "../src/shared/equalizer";
export const fixture = {
  artistRequests: 0,
  playing: true,
  spectrumDynamic: false,
  progress: 102,
  volume: 65,
  selected: 0,
  page: null as any,
  videoPresentationBarrier: null as (() => Promise<void>) | null,
  videoModeRequests: [] as boolean[],
  eq: defaultEqSettings(),
};
export const YtmClient = {
  subscribeSpectrum(listener: (frame: {available: boolean; bands: number[]}) => void) {
    const sample = () => listener({available: true, bands: Array.from({length: 32}, (_, i) => fixture.spectrumDynamic ? 0.5 + Math.sin(Date.now() / 80 + i) * 0.4 : 0.2 + (i % 7) / 10)});
    sample();
    const timer = setInterval(sample, 100);
    return () => clearInterval(timer);
  },
  async cmdTimed(_target: string, command: string, _timeout: number, ...args: any[]) {
    if (command === "artistArtwork") {
      fixture.artistRequests++;
      await new Promise(resolve => setTimeout(resolve, 150));
      return "https://lh3.googleusercontent.com/artist-" + args[0].channelId;
    }
    if (command === "spectrum")
      return {
        available: !!args[0],
        bands: Array.from({ length: 32 }, (_, i) => (args[0] ? fixture.spectrumDynamic ? 0.5 + Math.sin(Date.now() / 80 + i) * 0.4 : 0.2 + (i % 7) / 10 : 0)),
      };
    if (command === "status" || command === "preview") {
      if (command === "preview") fixture.eq = { ...fixture.eq, ...args[0] };
      return { state: "active", message: "Local test audio", sampleRate: 48000, headroomDb: 0 };
    }
    if (command === "playerQueue")
      return fixture.page.executeJavaScript("testPlayer.playerQueue()");
    if (command === "playerQueuePlay") {
      const result = await fixture.page.executeJavaScript(
        `testPlayer.playQueueOccurrence(${JSON.stringify(args[0])})`,
      );
      fixture.selected = await fixture.page.executeJavaScript("testPlayer.state.selected");
      return result;
    }
    if (command === "playerQueueMove") {
      const result = await fixture.page.executeJavaScript(`testPlayer.moveQueueOccurrence(${JSON.stringify(args[0])})`);
      fixture.selected = await fixture.page.executeJavaScript("testPlayer.state.selected");
      return result;
    }
    if (command === "playerQueueAction") {
      const result = await fixture.page.executeJavaScript(`testPlayer.queueOccurrenceAction(${JSON.stringify(args[0])})`);
      fixture.selected = await fixture.page.executeJavaScript("testPlayer.state.selected");
      return result;
    }
    if (command === "skinVideoPresentation") {
      const result = await fixture.page.executeJavaScript(`testPlayer.setSkinVideoPresentation(${!!args[0]}, ${!!args[1]})`);
      if (args[0]) await fixture.videoPresentationBarrier?.();
      return result;
    }
    if (command === "skinVideoDimensions")
      return fixture.page.executeJavaScript("(() => { const video = document.querySelector('video'); return { width: video.videoWidth, height: video.videoHeight }; })()");
    if (command === "skinVideoMode") {
      fixture.videoModeRequests.push(args[0] ?? true);
      return fixture.page.executeJavaScript(`testPlayer.requestSkinVideoMode(${args[0] ?? true})`);
    }
    throw new Error(`Unexpected test command: ${command}`);
  },
};
