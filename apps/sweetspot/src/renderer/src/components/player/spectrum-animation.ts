import { SPECTRUM_BANDS } from "@shared/skins/spectrum";

export const SPECTRUM_FRAME_MS = 1000 / 20;
/** One SVG path for all bars, plus one for classic peak markers. Pixel snapping
 * avoids repainting unchanged geometry; no React renders are needed per frame. */
export function spectrumPaths(levels: number[], peaks: number[], wave: boolean) {
  let bars = "",
    tips = "";
  if (wave) {
    // A 32-point envelope clipped by a cached SVG stripe pattern replaces 96
    // separate rectangles. Keep the same 5-unit rhythm and centered waveform.
    const heights = levels.map((level) => Math.round(level * 40));
    if (heights.some((height) => height > 0)) {
      bars = `M0 ${24 - heights[0] / 2}`;
      for (let i = 1; i < SPECTRUM_BANDS; i++)
        bars += `L${((i * 475) / (SPECTRUM_BANDS - 1)).toFixed(2)} ${24 - heights[i] / 2}`;
      bars += `L480 ${24 - heights[31] / 2}V${24 + heights[31] / 2}`;
      for (let i = SPECTRUM_BANDS - 1; i >= 0; i--)
        bars += `L${((i * 475) / (SPECTRUM_BANDS - 1)).toFixed(2)} ${24 + heights[i] / 2}`;
      bars += "Z";
    }
  } else {
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const height = Math.floor((levels[i] * 40) / 3) * 3;
      if (height) bars += `M${i * 5} ${43 - height}h3v${height}h-3Z`;
      tips += `M${i * 5} ${43 - Math.floor((peaks[i] * 40) / 3) * 3}h3v1h-3Z`;
    }
  }
  return { bars, tips };
}

export function animateSpectrum(options: {
  wave: boolean;
  playing: boolean;
  target: () => number[];
  paint: (paths: ReturnType<typeof spectrumPaths>) => void;
}) {
  const levels = Array(SPECTRUM_BANDS).fill(0),
    peaks = [...levels];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false,
    previous = performance.now(),
    lastBars = "?",
    lastTips = "?";
  const draw = () => {
    timer = undefined;
    if (disposed) return;
    const now = performance.now(),
      delta = Math.min(100, Math.max(1, now - previous));
    previous = now;
    const attack = 1 - Math.exp(-delta / 45),
      release = 1 - Math.exp(-delta / 140);
    const target = options.target();
    let moving = false;
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const value = target[i] ?? 0;
      const goal = options.playing && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
      levels[i] += (goal - levels[i]) * (goal > levels[i] ? attack : release);
      if (Math.abs(levels[i] - goal) < 0.005) levels[i] = goal;
      peaks[i] = options.wave
        ? 0
        : Math.max(levels[i], peaks[i] - delta * (options.playing ? 0.0003 : 0.003));
      moving ||= levels[i] !== goal || (!options.wave && peaks[i] > levels[i]);
    }
    const paths = spectrumPaths(levels, peaks, options.wave);
    if (paths.bars !== lastBars || paths.tips !== lastTips) {
      options.paint(paths);
      lastBars = paths.bars;
      lastTips = paths.tips;
    }
    // Settled levels (including silence) go idle; the next changed audio sample wakes us.
    if (moving) timer = setTimeout(draw, SPECTRUM_FRAME_MS);
  };
  const wake = () => {
    if (!disposed && timer === undefined) {
      previous = performance.now() - SPECTRUM_FRAME_MS;
      timer = setTimeout(draw, SPECTRUM_FRAME_MS);
    }
  };
  wake();
  return {
    wake,
    dispose: () => {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
