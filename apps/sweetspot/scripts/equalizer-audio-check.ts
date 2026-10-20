import { SpectrumStream } from "../src/renderer-plugins/youtube/equalizer/spectrum-stream";
import type { SpectrumFrame } from "../src/shared/skins/spectrum";
import { setSkinVideoPresentation } from "../src/renderer-plugins/youtube/player-video.page";
import { checkFadeEnvelopes, checkRealTransport } from "./playback-fades-audio-check";
import { checkStableVolume } from "./stable-volume-audio-check";
import {
  BUILTIN_EQ_PRESETS,
  defaultEqSettings,
  eqFrequencyGrid,
  eqResponseDb,
} from "../src/shared/equalizer";
import {
  createEqualizerGraph,
  EqualizerAudio,
  canProcessMedia,
} from "../src/renderer-plugins/youtube/equalizer/audio";
import {
  enableVolumeRatio,
  disableVolumeRatio,
} from "../src/renderer-plugins/youtube/resources/volume-ratio/patch";

function check(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const fadeEnvelopes = await checkFadeEnvelopes();
  const stableVolume = await checkStableVolume();
  let cases = 0;
  let maximumResponseError = 0;
  let maximumFixturePeak = 0;
  for (const rate of [44100, 48000]) {
    for (const gains of [
      ...BUILTIN_EQ_PRESETS.map((preset) => preset.gains),
      Array(10).fill(12),
      Array(10).fill(-12),
    ]) {
      const context = new OfflineAudioContext(2, rate, rate);
      const graph = createEqualizerGraph(context, { enabled: true, autoHeadroom: true, gains });
      const frequencies = eqFrequencyGrid(rate, 1000);
      const actual = Array(frequencies.length).fill(0);
      for (const filter of graph.filters) {
        const magnitude = new Float32Array(frequencies.length);
        filter.getFrequencyResponse(
          new Float32Array(frequencies),
          magnitude,
          new Float32Array(frequencies.length),
        );
        magnitude.forEach((value, i) => {
          actual[i] += 20 * Math.log10(value);
        });
      }
      const expected = eqResponseDb(gains, rate, frequencies);
      actual.forEach((value, i) => {
        maximumResponseError = Math.max(maximumResponseError, Math.abs(value - expected[i]));
      });
      check(maximumResponseError < 0.001, "Native response differs from UI/headroom calculation");
      const buffer = context.createBuffer(2, rate, rate);
      for (let i = 0; i < rate; i++) {
        // Independent channels: a full-scale multitone and a sharp bipolar transient.
        buffer.getChannelData(0)[i] =
          (Math.sin((i * 2 * Math.PI * 63) / rate) +
            Math.sin((i * 2 * Math.PI * 1000) / rate) +
            Math.sin((i * 2 * Math.PI * 16000) / rate)) /
          3;
        buffer.getChannelData(1)[i] = i === 100 ? 1 : i === 101 ? -1 : 0;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(graph.gain);
      source.start();
      const output = await context.startRendering();
      for (let channel = 0; channel < 2; channel++)
        for (const value of output.getChannelData(channel)) {
          check(Number.isFinite(value), "Non-finite audio sample");
          maximumFixturePeak = Math.max(maximumFixturePeak, Math.abs(value));
        }
      if (gains.every((gain) => gain === 0))
        for (let channel = 0; channel < 2; channel++) {
          const result = output.getChannelData(channel),
            input = buffer.getChannelData(channel);
          check(
            result.every((value, i) => Math.abs(value - input[i]) < 1e-6),
            "Flat graph is not transparent or stereo was altered",
          );
        }
      cases++;
    }
  }
  check(maximumFixturePeak <= 1.001, "Clipping in the measured fixture set");
  // Real HTML media attachment, volume compatibility, repeated toggles, and element replacement.
  const pcm = new ArrayBuffer(44 + 48000 * 2);
  const view = new DataView(pcm);
  const ascii = (offset: number, text: string) =>
    [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, pcm.byteLength - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 48000, true);
  view.setUint32(28, 96000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, 96000, true);
  for (let i = 0; i < 48000; i++)
    view.setInt16(44 + i * 2, Math.sin((i * 2 * Math.PI * 440) / 48000) * 50, true);
  const blobUrl = URL.createObjectURL(new Blob([pcm], { type: "audio/wav" }));
  // Use the same media element type as the native video pane tested below.
  const audio = document.createElement("video");
  document.body.append(audio);
  audio.src = blobUrl;
  audio.loop = true;
  await new Promise<void>((resolve) =>
    audio.addEventListener("canplay", () => resolve(), { once: true }),
  );
  check(canProcessMedia(audio, location.origin), "Local blob source should be processable");
  check(
    !canProcessMedia(
      { currentSrc: "https://other.invalid/audio.mp3", crossOrigin: null } as HTMLMediaElement,
      location.origin,
    ),
    "Unsafe cross-origin source was accepted",
  );
  enableVolumeRatio();
  audio.volume = 0.5;
  check(Math.abs(audio.volume - 0.5) < 0.001, "Existing volume curve changed");
  let captures = 0;
  const original = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (element) {
    captures++;
    return original.call(this, element);
  };
  const engine = new EqualizerAudio();
  // Default-on fades must capture local media with both EQ and leveling disabled.
  engine.setConfig(defaultEqSettings());
  engine.setStableVolume(false);
  engine.attach(audio);
  await audio.play();
  await delay(100);
  engine.attach(audio);
  check(captures === 1, "Default-on fades did not attach with EQ and leveling off");
  engine.setStableVolume(true);
  engine.setConfig({ ...defaultEqSettings(), enabled: true });
  check(engine.status().state === "enabled", `Engine not active: ${engine.status().message}`);
  for (let i = 0; i < 10; i++) {
    engine.setConfig({
      enabled: i % 2 === 0,
      autoHeadroom: true,
      gains: [...BUILTIN_EQ_PRESETS[i % BUILTIN_EQ_PRESETS.length].gains],
    });
    engine.attach(audio);
    await delay(10);
  }
  engine.bypass();
  await delay(150);
  check(captures === 1, "Toggling recaptured the same media element");
  const internals = engine as unknown as {
    active: {
      gain: GainNode;
      filters: BiquadFilterNode[];
      stable: { wet: GainNode; dry: GainNode };
    };
  };
  check(
    internals.active.filters.every((filter) => Math.abs(filter.gain.value) < 1e-6),
    "Bypass did not settle flat",
  );
  check(Math.abs(internals.active.gain.gain.value - 1) < 1e-6, "Bypass did not restore unity");
  check(
    internals.active.stable.wet.gain.value === 0 && internals.active.stable.dry.gain.value === 1,
    "Leveling bypass did not settle",
  );
  engine.setVisualizationEnabled(true);
  engine.attach(audio);
  await delay(200);
  const spectrum = engine.spectrum();
  check(
    spectrum.available && spectrum.bands.some((level) => level > 0),
    `Spectrum did not read audio: ${JSON.stringify({ spectrum, paused: audio.paused, state: (engine as any).context.state, gain: (engine as any).active.fades.gain.gain.value })}`,
  );
  audio.volume = 0.8;
  await delay(200);
  check(
    Math.max(...engine.spectrum().bands) > Math.max(...spectrum.bands),
    "Spectrum did not respond to an actual signal level change",
  );
  audio.volume = 0.5;
  const peak = spectrum.bands.indexOf(Math.max(...spectrum.bands));
  const peakFrequency = 20 * 1000 ** ((peak + 0.5) / 32);
  check(
    peakFrequency > 300 && peakFrequency < 650,
    "440 Hz fixture appears in the wrong spectrum band",
  );
  const streamed: SpectrumFrame[] = [];
  const liveStream = new SpectrumStream(() => engine.spectrum(), frame => streamed.push(frame));
  liveStream.setEnabled(true);
  liveStream.setEnabled(true);
  await delay(450);
  check(streamed.length > 0 && streamed.length <= 6, "Live spectrum stream exceeded the 10 Hz budget");
  check(streamed.some(frame => frame.available && frame.bands.some(level => level > 0)), "Stream lost the real audio signal");
  audio.pause();
  await delay(150);
  check(streamed.at(-1)?.bands.every(level => level === 0), "Stream did not report paused silence");
  liveStream.setEnabled(false);
  const stoppedFrames = streamed.length;
  await delay(150);
  check(streamed.length === stoppedFrames, "Stopped spectrum stream kept publishing");
  check(
    engine.spectrum().bands.every((level) => level === 0),
    "Paused spectrum did not settle to zero",
  );
  await audio.play();
  engine.setCast(true);
  check(!engine.spectrum().available, "Casting exposed local spectrum data");
  engine.setCast(false);
  engine.setVisualizationEnabled(false);
  check(!engine.spectrum().available, "Disabled analyzer is still active");
  check(captures === 1, "Spectrum recaptured the media element");
  engine.setFadeConfig({ smoothPlayPause: true, songFades: false, songFadeSeconds: 1 });
  engine.attach(audio);
  const moviePlayer = document.createElement("div");
  moviePlayer.id = "movie_player";
  document.body.append(moviePlayer);
  moviePlayer.append(audio);
  let siteClicks = 0;
  const siteClick = (event: Event) => {
    if (event.target === audio) {
      siteClicks++;
      audio.pause();
      setTimeout(() => void audio.play(), 80);
    }
  };
  document.addEventListener("click", siteClick);
  setSkinVideoPresentation(true, () => {
    const pause = engine.localPlaying && !engine.pendingPause;
    return engine.transport(pause ? "pause" : "play", () => (pause ? audio.pause() : audio.play()));
  });
  audio.click();
  await delay(800);
  check(
    audio.paused && siteClicks === 0,
    "Skin video click did not remain paused with fades enabled",
  );
  audio.click();
  await delay(200);
  check(!audio.paused, "Skin video click did not resume with fades enabled");
  setSkinVideoPresentation(false);
  document.removeEventListener("click", siteClick);
  // Anchor this one-second looping fixture away from its seek/loop boundary.
  audio.currentTime = 0;
  await delay(100);
  const transportFades = await checkRealTransport(engine, audio);
  engine.setStableVolume(true);
  await delay(80);
  check(internals.active.stable.wet.gain.value === 1, "Leveling did not re-enable");
  engine.setConfig({ enabled: true, autoHeadroom: true, gains: Array(10).fill(12) });
  engine.setCast(true);
  check(engine.status().state === "cast", "Cast status not shown");
  await delay(80);
  check(internals.active.stable.wet.gain.value === 0, "Leveling did not bypass during casting");
  engine.setCast(false);
  const replacement = audio.cloneNode() as HTMLMediaElement;
  document.body.append(replacement);
  replacement.load();
  await new Promise<void>((resolve) =>
    replacement.addEventListener("canplay", () => resolve(), { once: true }),
  );
  engine.attach(replacement);
  await delay(150);
  check(captures === 2, "Replacement element did not receive one source");
  const spectrumOnlyMedia = audio.cloneNode() as HTMLMediaElement;
  document.body.append(spectrumOnlyMedia);
  spectrumOnlyMedia.load();
  await new Promise<void>((resolve) =>
    spectrumOnlyMedia.addEventListener("canplay", () => resolve(), { once: true }),
  );
  const spectrumOnly = new EqualizerAudio();
  spectrumOnly.bypass();
  spectrumOnly.setVisualizationEnabled(true);
  await spectrumOnlyMedia.play();
  let onlyReady = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    spectrumOnly.attach(spectrumOnlyMedia);
    await delay(80);
    onlyReady = spectrumOnly.spectrum().bands.some((level) => level > 0);
    if (onlyReady) break;
  }
  check(onlyReady, "Visualization-only playback could not attach with all sound effects disabled");
  check(captures === 3, "Visualization-only media was captured more than once");
  spectrumOnly.bypass();
  spectrumOnlyMedia.pause();
  engine.bypass();
  audio.pause();
  replacement.pause();
  disableVolumeRatio();
  AudioContext.prototype.createMediaElementSource = original;
  return {
    fadeEnvelopes,
    transportFades,
    stableVolume,
    offlineCases: cases,
    maximumResponseErrorDb: maximumResponseError,
    maximumMeasuredSamplePeak: maximumFixturePeak,
    captures,
    spectrum: "real 440 Hz signal, bounded 10 Hz stream, pause, stream teardown, cast, disabled state and source reuse passed",
    lifecycle: "passed",
    volumeCompatibility: "passed",
  };
}
(window as Window & { runEqualizerChecks?: typeof run }).runEqualizerChecks = run;
