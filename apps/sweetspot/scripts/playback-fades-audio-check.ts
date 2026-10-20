import { fadeGain, setFadeGain } from "../src/renderer-plugins/youtube/equalizer/playback-fades";
import { DEFAULT_PLAYBACK_TRANSITIONS } from "../src/shared/playback-transitions";
import type { EqualizerAudio } from "../src/renderer-plugins/youtube/equalizer/audio";

const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function checkFadeEnvelopes() {
  const results = [];
  for (const rate of [44100, 48000]) {
    const context = new OfflineAudioContext(2, rate, rate);
    const buffer = context.createBuffer(2, rate, rate);
    buffer.getChannelData(0).fill(0.5);
    buffer.getChannelData(1).fill(-0.5);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    setFadeGain(gain.gain, 0, 0);
    fadeGain(gain.gain, 0, 1, 0.1);
    source.connect(gain).connect(context.destination);
    source.start();
    const down = context.suspend(0.14).then(async () => {
      fadeGain(gain.gain, context.currentTime, 0, 0.07);
      await context.resume();
    });
    const reverse = context.suspend(0.17).then(async () => {
      fadeGain(gain.gain, context.currentTime, 1, 0.1);
      await context.resume();
    });
    const stop = context.suspend(0.6).then(async () => {
      fadeGain(gain.gain, context.currentTime, 0, 0.07);
      await context.resume();
    });
    const output = await context.startRendering();
    await Promise.all([down, reverse, stop]);
    const left = output.getChannelData(0),
      right = output.getChannelData(1);
    let maximumStep = 0;
    let stepIndex = 0;
    for (let i = 0; i < rate; i++) {
      check(
        Number.isFinite(left[i]) && Math.abs(left[i]) <= 0.500001,
        "Fade added gain/nonfinite sample",
      );
      check(Math.abs(left[i] + right[i]) < 1e-8, "Fade changed stereo balance");
      if (i && Math.abs(left[i] - left[i - 1]) > maximumStep) {
        maximumStep = Math.abs(left[i] - left[i - 1]);
        stepIndex = i;
      }
    }
    check(
      maximumStep < 0.0003,
      `Interrupted envelope has step ${maximumStep} at ${stepIndex / rate}: ${left[stepIndex - 1]} -> ${left[stepIndex]}`,
    );
    check(left[0] === 0 && left[Math.floor(rate * 0.11)] > 0.499, "Play envelope endpoints wrong");
    check(
      left.subarray(Math.floor(rate * 0.7)).every((value) => value === 0),
      "Pause envelope did not reach exact silence",
    );
    results.push({ sampleRate: rate, maximumStep, stereoAndEndpoints: "passed" });
  }
  return results;
}

export async function checkRealTransport(engine: EqualizerAudio, audio: HTMLMediaElement) {
  engine.setStableVolume(false);
  engine.setConfig({ enabled: false, gains: Array(10).fill(0), autoHeadroom: true });
  engine.setFadeConfig(DEFAULT_PLAYBACK_TRANSITIONS);
  engine.attach(audio);
  const volume = audio.volume;
  const pause = engine.transport("pause", () => audio.pause());
  await wait(25);
  check(!audio.paused, "Real playback stopped before its fade");
  await pause;
  check(audio.paused, "Real pause was not executed");
  const stoppedTime = audio.currentTime;
  await wait(80);
  check(Math.abs(audio.currentTime - stoppedTime) < 0.01, "Media time continued after pause");
  await engine.transport("play", () => audio.play());
  await wait(150);
  const graph = (engine as any).active.fades;
  check(Math.abs(graph.gain.gain.value - 1) < 1e-6, "Play fade did not reach unity");
  const obsoletePause = engine.transport("pause", () => audio.pause());
  await wait(20);
  await engine.transport("play", () => audio.play());
  await wait(150);
  check(
    !audio.paused && ((await obsoletePause) as any).cancelled,
    "Rapid reversal executed a stale pause",
  );
  try {
    await engine.transport("skip", () => {
      throw new Error("fixture failure");
    });
  } catch {}
  await wait(100);
  check(graph.gain.gain.value > 0.99, "Failed skip left playback silent");
  // Keep the old decoder playing while the site's next-track request is still loading.
  audio.currentTime = 0;
  await wait(100);
  let nextReady!: Promise<void>;
  await engine.transport("skip", () => {
    nextReady = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        audio.addEventListener(
          "canplay",
          () => {
            void audio.play().then(() => resolve(), reject);
          },
          { once: true },
        );
        audio.load();
      }, 350);
    });
  });
  await wait(150);
  audio.dispatchEvent(new Event("timeupdate"));
  await wait(50);
  check(!audio.paused, "Delayed skip fixture stopped the old decoder prematurely");
  check(
    graph.gain.gain.value < 0.001,
    "Outgoing song became audible again before next source loaded",
  );
  await nextReady;
  await wait(150);
  check(graph.gain.gain.value > 0.99, "Next source did not become audible after loading");
  check(audio.volume === volume, "Transport fades changed the volume slider");
  // A one-second clip with a five-second configured fade must still have an audible middle.
  audio.loop = false;
  engine.setFadeConfig({ ...DEFAULT_PLAYBACK_TRANSITIONS, songFades: true, songFadeSeconds: 5 });
  audio.pause();
  audio.load();
  await new Promise<void>((resolve) =>
    audio.addEventListener("canplay", () => resolve(), { once: true }),
  );
  await engine.transport("play", () => audio.play());
  await wait(450);
  check(graph.gain.gain.value > 0.5, "Short song was muted by overlapping start/end envelopes");
  await wait(650);
  check(audio.ended && graph.gain.gain.value < 0.01, "Song end did not reach silence");
  audio.loop = true;
  engine.setFadeConfig(DEFAULT_PLAYBACK_TRANSITIONS);
  await engine.transport("play", () => audio.play());
  await wait(150);
  const closingPause = engine.transport("pause", () => audio.pause());
  await wait(20);
  engine.bypass();
  check(
    ((await closingPause) as any).cancelled && !audio.paused,
    "Teardown executed a stale pause",
  );
  await wait(80);
  check(graph.gain.gain.value > 0.99, "Teardown did not preserve an audible path");
  return {
    pauseOrdering: "passed",
    rapidReversal: "passed",
    failedSkipRecovery: "passed",
    delayedSkipHandoff: "passed",
    shortSongAndNaturalEnd: "passed",
    volumePreserved: "passed",
    teardownCancellation: "passed",
  };
}
