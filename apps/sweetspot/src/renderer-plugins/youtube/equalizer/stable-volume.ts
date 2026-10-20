/** Gentle, stereo-linked compression. No upward gain, silence detection, or timer-driven AGC. */
function compressor(context: BaseAudioContext): DynamicsCompressorNode {
  const node = context.createDynamicsCompressor();
  node.threshold.value = -24;
  node.knee.value = 12;
  node.ratio.value = 2;
  node.attack.value = 0.02;
  node.release.value = 0.4;
  return node;
}

/** Measure this engine's fixed automatic makeup gain instead of guessing or double-boosting. */
export async function measureStableVolumeMakeup(sampleRate: number): Promise<number> {
  const context = new OfflineAudioContext(2, Math.ceil(sampleRate * 3), sampleRate);
  const input = context.createBuffer(2, context.length, sampleRate);
  for (let channel = 0; channel < 2; channel++) input.getChannelData(channel).fill(0.00001);
  const source = context.createBufferSource();
  source.buffer = input;
  source.connect(compressor(context)).connect(context.destination);
  source.start();
  const output = (await context.startRendering()).getChannelData(0);
  const samples = output.subarray(Math.floor(output.length * 0.9));
  const makeup = samples.reduce((sum, value) => sum + value, 0) / samples.length / 0.00001;
  if (!Number.isFinite(makeup) || makeup < 1 || makeup > 10)
    throw new Error("Unexpected compressor makeup gain");
  return makeup;
}

export function createStableVolumeGraph(context: BaseAudioContext, makeup: number) {
  const input = context.createGain();
  const output = context.createGain();
  const normalize = context.createGain();
  const restore = context.createGain();
  const wet = context.createGain();
  const dry = context.createGain();
  const delay = context.createDelay(0.01);
  const dynamics = compressor(context);
  // Match the compressor's specified 6 ms lookahead on bypass, avoiding comb filtering on toggles.
  delay.delayTime.value = 0.006;
  wet.gain.value = 0;
  restore.gain.value = 1 / makeup;
  input.connect(delay).connect(dry).connect(output);
  input.connect(normalize).connect(dynamics).connect(restore).connect(wet).connect(output);
  let lastVolume = -1;
  let lastEnabled = false;
  return {
    input,
    output,
    dynamics,
    dry,
    wet,
    update(enabled: boolean, nativeVolume: number) {
      // The media source already includes the volume slider. Undo it ONLY inside the detector
      // branch, then restore it after compression. Mute stays silent, with bounded reciprocal.
      const volume = Math.max(0.000001, Math.min(1, nativeVolume));
      const now = context.currentTime;
      if (volume !== lastVolume) {
        normalize.gain.setValueAtTime(1 / volume, now);
        restore.gain.setValueAtTime(volume / makeup, now);
        lastVolume = volume;
      }
      if (enabled !== lastEnabled) {
        for (const [param, value] of [
          [wet.gain, enabled ? 1 : 0],
          [dry.gain, enabled ? 0 : 1],
        ] as const) {
          param.cancelAndHoldAtTime(now);
          param.linearRampToValueAtTime(value, now + 0.04);
        }
        lastEnabled = enabled;
      }
    },
  };
}

export type StableVolumeGraph = ReturnType<typeof createStableVolumeGraph>;
