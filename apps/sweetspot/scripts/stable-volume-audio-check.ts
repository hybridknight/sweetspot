import {
  createStableVolumeGraph,
  measureStableVolumeMakeup,
} from "../src/renderer-plugins/youtube/equalizer/stable-volume";
import { createEqualizerGraph } from "../src/renderer-plugins/youtube/equalizer/audio";
import { BUILTIN_EQ_PRESETS } from "../src/shared/equalizer";

const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

export async function checkStableVolume() {
  const results: {
    sampleRate: number;
    nativeVolume: number;
    spreadBeforeDb: number;
    spreadAfterDb: number;
    peak: number;
    makeupDb: number;
  }[] = [];
  for (const sampleRate of [44100, 48000]) {
    const makeup = await measureStableVolumeMakeup(sampleRate);
    for (const nativeVolume of [1, 0.125, 0.000125, 0.000001]) {
      for (const enabled of [false, true]) {
        const context = new OfflineAudioContext(2, sampleRate * 5, sampleRate);
        const graph = createStableVolumeGraph(context, makeup);
        graph.output.connect(context.destination);
        graph.update(enabled, nativeVolume);
        const buffer = context.createBuffer(2, context.length, sampleRate);
        for (let i = 0; i < buffer.length; i++) {
          const amplitude =
            i < sampleRate ? 0.03 : i < sampleRate * 2 ? 0.8 : i < sampleRate * 4 ? 0.03 : 0;
          const value = amplitude * nativeVolume * Math.sin((i * 2 * Math.PI * 440) / sampleRate);
          buffer.getChannelData(0)[i] = value;
          buffer.getChannelData(1)[i] = -value;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(graph.input);
        source.start();
        const output = await context.startRendering();
        const left = output.getChannelData(0),
          right = output.getChannelData(1);
        let peak = 0;
        for (let i = 0; i < left.length; i++) {
          check(
            Number.isFinite(left[i]) && Number.isFinite(right[i]),
            "Nonfinite stable volume sample",
          );
          peak = Math.max(peak, Math.abs(left[i]));
          check(Math.abs(left[i] + right[i]) < 1e-7, "Stable volume changed stereo image");
          if (i > sampleRate * 4.02)
            check(Math.abs(left[i]) < 1e-9, "Stable volume amplified silence");
        }
        check(peak <= nativeVolume * 0.801, "Stable volume introduced gain or clipping");
        const rms = (start: number, end: number) => {
          const samples = left.subarray(
            Math.floor(start * sampleRate),
            Math.floor(end * sampleRate),
          );
          return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        };
        const spreadBeforeDb = 20 * Math.log10(0.8 / 0.03);
        const spreadAfterDb = 20 * Math.log10(rms(1.6, 1.9) / rms(0.6, 0.9));
        if (enabled) {
          check(
            spreadAfterDb < spreadBeforeDb - 4,
            "Stable volume did not reduce loud/quiet differences",
          );
          check(
            Math.abs(rms(0.6, 0.9) / ((0.03 * nativeVolume) / Math.sqrt(2)) - 1) < 0.01,
            `Quiet content gain ${rms(0.6, 0.9) / ((0.03 * nativeVolume) / Math.sqrt(2))}, makeup ${makeup}, rate ${sampleRate}, volume ${nativeVolume}`,
          );
          results.push({
            sampleRate,
            nativeVolume,
            spreadBeforeDb,
            spreadAfterDb,
            peak,
            makeupDb: 20 * Math.log10(makeup),
          });
        } else {
          const offset = Math.round(sampleRate * 0.006);
          // Fractional delay at 44.1 kHz interpolates; a 1 kHz-width tolerance permits that only.
          let maxError = 0;
          for (let i = sampleRate / 2; i < sampleRate * 0.9; i++)
            maxError = Math.max(
              maxError,
              Math.abs(left[Math.floor(i)] - buffer.getChannelData(0)[Math.floor(i) - offset]),
            );
          check(
            maxError < nativeVolume * 0.001,
            "Stable volume bypass changed audio beyond its 6 ms delay",
          );
        }
      }
    }
    // Independent channel transients, bass and full-scale input through every EQ preset.
    for (const gains of [...BUILTIN_EQ_PRESETS.map((preset) => preset.gains), Array(10).fill(12)]) {
      const context = new OfflineAudioContext(2, sampleRate * 2, sampleRate);
      const stable = createStableVolumeGraph(context, makeup);
      const eq = createEqualizerGraph(context, { enabled: true, autoHeadroom: true, gains });
      stable.output.connect(eq.gain);
      stable.update(true, 1);
      const buffer = context.createBuffer(2, context.length, sampleRate);
      for (let i = Math.floor(sampleRate * 0.2); i < sampleRate; i++) {
        buffer.getChannelData(0)[i] =
          0.6 * Math.sin((i * 2 * Math.PI * 63) / sampleRate) +
          0.4 * Math.sin((i * 2 * Math.PI * 1000) / sampleRate);
        buffer.getChannelData(1)[i] = i % 2000 === 0 ? 1 : i % 2000 === 1 ? -1 : 0;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(stable.input);
      source.start();
      const output = await context.startRendering();
      for (let channel = 0; channel < 2; channel++) {
        const samples = output.getChannelData(channel);
        check(
          samples.every((sample) => Number.isFinite(sample) && Math.abs(sample) <= 1.001),
          "Clipping/nonfinite samples in combined EQ and stable volume fixture",
        );
        check(
          samples.subarray(0, sampleRate * 0.19).every((sample) => sample === 0),
          "Silence preceding a transient was changed",
        );
      }
    }
  }
  return results;
}
