import { describe, expect, it } from "vitest";
import {
  BUILTIN_EQ_PRESETS,
  defaultEqSettings,
  EQ_FREQUENCIES,
  eqFrequencyGrid,
  eqGainsSchema,
  eqHeadroomDb,
  eqResponseDb,
  matchingEqPreset,
  readEqSettings,
  saveEqPreset,
} from "./equalizer";

describe("equalizer presets and persisted settings", () => {
  it("starts flat, disabled, and with headroom enabled", () => {
    expect(readEqSettings(undefined)).toEqual(defaultEqSettings());
  });
  it("rejects unsafe band values and recovers corrupt stored data", () => {
    for (const gains of [[0], Array(10).fill(NaN), Array(10).fill(Infinity), Array(10).fill(13)])
      expect(eqGainsSchema.safeParse(gains).success).toBe(false);
    expect(
      readEqSettings({
        gains: Array(10).fill(50),
        presets: [{ id: "flat", name: "Flat", gains: Array(10).fill(0) }],
      }),
    ).toEqual(defaultEqSettings());
  });
  it("saves independent copies, survives a serialized restart, and updates or renames by ID", () => {
    const gains = [...BUILTIN_EQ_PRESETS[1].gains];
    const saved = saveEqPreset(defaultEqSettings(), {
      id: "custom-one",
      name: " My headphones ",
      gains,
    });
    gains[0] = 12;
    expect(saved.presets[0].gains[0]).toBe(1);
    expect(saved.presets[0].name).toBe("My headphones");
    const restarted = readEqSettings(JSON.parse(JSON.stringify(saved)));
    expect(restarted).toEqual(saved);
    const updated = saveEqPreset(
      restarted,
      { id: "custom-one", name: "Evening", gains: Array(10).fill(-2) },
      "custom-one",
    );
    expect(updated.presets).toHaveLength(1);
    expect(updated.presets[0]).toEqual({
      id: "custom-one",
      name: "Evening",
      gains: Array(10).fill(-2),
    });
    expect(defaultEqSettings().presets).toHaveLength(0);
  });
  it("protects built-ins, duplicate names, missing replacements and preset limits", () => {
    const preset = { id: "custom-one", name: "Evening", gains: Array(10).fill(0) };
    const saved = saveEqPreset(defaultEqSettings(), preset);
    expect(() => saveEqPreset(saved, { ...preset, id: "two", name: "evening" })).toThrow(
      "already exists",
    );
    expect(() => saveEqPreset(saved, { ...preset, name: "Warm" })).toThrow("already exists");
    expect(() => saveEqPreset(saved, { ...preset, id: "flat" })).toThrow();
    expect(() => saveEqPreset(saved, preset, "missing")).toThrow("no longer exists");
    expect(() =>
      saveEqPreset(
        {
          ...saved,
          presets: Array.from({ length: 100 }, (_, i) => ({ ...preset, id: `${i}`, name: `${i}` })),
        },
        { ...preset, id: "new" },
      ),
    ).toThrow("100");
  });
  it("matches unchanged curves and recognizes manual edits", () => {
    for (const preset of BUILTIN_EQ_PRESETS)
      expect(matchingEqPreset(preset.gains, BUILTIN_EQ_PRESETS)?.id).toBe(preset.id);
    expect(matchingEqPreset(Array(10).fill(0.5), BUILTIN_EQ_PRESETS)).toBeUndefined();
  });
});

describe("equalizer response and headroom", () => {
  it.each([44100, 48000, 96000])("has a unity flat response at %i Hz", (sampleRate) => {
    expect(
      eqResponseDb(Array(10).fill(0), sampleRate, eqFrequencyGrid(sampleRate)).every(
        (db) => Math.abs(db) < 1e-9,
      ),
    ).toBe(true);
    expect(eqHeadroomDb(Array(10).fill(0), sampleRate)).toBe(0);
  });
  it.each([44100, 48000])("meets isolated band gain at its center at %i Hz", (sampleRate) => {
    EQ_FREQUENCIES.forEach((frequency, i) => {
      for (const gain of [-12, -3, 3, 12]) {
        const gains = Array(10).fill(0);
        gains[i] = gain;
        expect(eqResponseDb(gains, sampleRate, [frequency])[0]).toBeCloseTo(gain, 5);
      }
    });
  });
  it("accounts for overlapping boosts rather than only the highest fader", () => {
    const gains = Array(10).fill(6);
    expect(eqHeadroomDb(gains, 48000)).toBeLessThan(-7);
    const response = eqResponseDb(gains, 48000, eqFrequencyGrid(48000, 10000));
    expect(Math.max(...response) + eqHeadroomDb(gains, 48000)).toBeLessThan(-0.99);
  });
  it("keeps preset and extreme responses finite and leaves headroom at both common rates", () => {
    for (const sampleRate of [44100, 48000])
      for (const gains of [
        ...BUILTIN_EQ_PRESETS.map((p) => p.gains),
        Array(10).fill(12),
        Array(10).fill(-12),
      ]) {
        const response = eqResponseDb(gains, sampleRate, eqFrequencyGrid(sampleRate, 10000));
        expect(response.every(Number.isFinite)).toBe(true);
        expect(Math.max(...response) + eqHeadroomDb(gains, sampleRate)).toBeLessThanOrEqual(0.001);
      }
  });
});
