import { describe, it, expect } from "vitest";
import { spectrumBands, emptySpectrum, isSpectrumFrame } from "./spectrum";
describe("spectrum bands", () => {
  it("places tones in distinct logarithmic bands and bounds output", () => {
    const sampleRate = 48000;
    const bandsFor = (frequency: number) => {
      const bins = new Uint8Array(1024);
      bins[Math.round((frequency * 2048) / sampleRate)] = 255;
      return spectrumBands(bins, sampleRate);
    };
    const bass = bandsFor(120),
      treble = bandsFor(5000);
    expect(bass.indexOf(1)).toBeLessThan(treble.indexOf(1));
    expect(bass).toHaveLength(32);
    expect([...bass, ...treble].every((value) => value >= 0 && value <= 1)).toBe(true);
  });
  it("keeps silence and unavailable audio empty", () => {
    expect(spectrumBands(new Uint8Array(1024), 48000)).toEqual(Array(32).fill(0));
    expect(emptySpectrum()).toEqual({ available: false, bands: Array(32).fill(0) });
  });
});

describe("spectrum IPC payload", () => {
  it("accepts only bounded finite 32-band numeric frames", () => {
    expect(isSpectrumFrame(emptySpectrum())).toBe(true);
    for (const invalid of [
      null,
      {},
      { available: true, bands: Array(50000).fill(0) },
      { available: 1, bands: Array(32).fill(0) },
      ...[NaN, Infinity, -1, 2, "0"].map((value) => ({
        available: true,
        bands: Array(32).fill(value),
      })),
    ])
      expect(isSpectrumFrame(invalid)).toBe(false);
  });
});
