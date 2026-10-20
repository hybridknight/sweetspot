export const SPECTRUM_BANDS = 32;
export const SPECTRUM_SAMPLE_MS = 100;
export const SPECTRUM_CHANNEL = "equalizer:spectrum";
/** Treat page-world audio data as untrusted, bounded numeric data. */
export function isSpectrumFrame(value: unknown): value is SpectrumFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as Partial<SpectrumFrame>;
  return (
    Object.keys(frame).length === 2 &&
    typeof frame.available === "boolean" &&
    Array.isArray(frame.bands) &&
    frame.bands.length === SPECTRUM_BANDS &&
    frame.bands.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1)
  );
}
export type SpectrumFrame = { available: boolean; bands: number[] };
export const emptySpectrum = (): SpectrumFrame => ({
  available: false,
  bands: Array(SPECTRUM_BANDS).fill(0),
});
/** Logarithmic frequency bands: low notes on the left, high notes on the right. */
export function spectrumBands(bins: Uint8Array, sampleRate: number): number[] {
  const upper = Math.min(20000, sampleRate / 2);
  return Array.from({ length: SPECTRUM_BANDS }, (_, band) => {
    const low = Math.max(
      1,
      Math.floor((20 * (upper / 20) ** (band / SPECTRUM_BANDS) * bins.length * 2) / sampleRate),
    );
    const high = Math.min(
      bins.length,
      Math.max(
        low + 1,
        Math.ceil(
          (20 * (upper / 20) ** ((band + 1) / SPECTRUM_BANDS) * bins.length * 2) / sampleRate,
        ),
      ),
    );
    let peak = 0;
    for (let bin = low; bin < high; bin++) peak = Math.max(peak, bins[bin]);
    return peak / 255;
  });
}
