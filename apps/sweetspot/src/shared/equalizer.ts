import { z } from "zod";

export const EQ_FREQUENCIES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_LABELS = ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"] as const;
export const EQ_Q = Math.SQRT2;
export const eqGainsSchema = z.array(z.number().finite().min(-12).max(12)).length(10);
export const eqPlaybackSchema = z.object({
  enabled: z.boolean(),
  gains: eqGainsSchema,
  autoHeadroom: z.boolean(),
});
export const eqPresetNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a preset name.")
  .max(60, "Use at most 60 characters.");
export const eqPresetSchema = z.object({
  id: z.string().min(1).max(100),
  name: eqPresetNameSchema,
  gains: eqGainsSchema,
});
export const eqSettingsSchema = eqPlaybackSchema.extend({
  version: z.literal(1),
  presets: z.array(eqPresetSchema).max(100),
});
export type EqPlayback = z.infer<typeof eqPlaybackSchema>;
export type EqPreset = z.infer<typeof eqPresetSchema>;
export type EqSettings = z.infer<typeof eqSettingsSchema>;

export const BUILTIN_EQ_PRESETS: readonly EqPreset[] = [
  { id: "flat", name: "Flat", gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: "warm", name: "Warm", gains: [1, 2, 2, 1, 0, 0, 0, -0.5, -1, -1] },
  { id: "bass-boost", name: "Bass Boost", gains: [3, 4, 3, 1, 0, 0, 0, 0, 0, 0] },
  { id: "bass-reduction", name: "Bass Reduction", gains: [-4, -3, -2, -1, 0, 0, 0, 0, 0, 0] },
  { id: "vocal-clarity", name: "Vocal Clarity", gains: [-1, -1, -1, -1, 0, 1, 2, 1.5, 0, 0] },
  { id: "gentle-treble", name: "Gentle Treble", gains: [0, 0, 0, 0, 0, 0, 0.5, 1, 2, 2] },
];

export function defaultEqSettings(): EqSettings {
  return { version: 1, enabled: false, autoHeadroom: true, gains: Array(10).fill(0), presets: [] };
}

/** Tolerate old/malformed stored values without ever sending unsafe gains to audio. */
export function readEqSettings(raw: unknown): EqSettings {
  const base = defaultEqSettings();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Record<string, unknown>;
  const gains = eqGainsSchema.safeParse(value.gains);
  const presets: EqPreset[] = [];
  const ids = new Set(BUILTIN_EQ_PRESETS.map((p) => p.id));
  const names = new Set(BUILTIN_EQ_PRESETS.map((p) => p.name.toLowerCase()));
  for (const item of Array.isArray(value.presets) ? value.presets.slice(0, 100) : []) {
    const parsed = eqPresetSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id) || names.has(parsed.data.name.toLowerCase()))
      continue;
    presets.push(parsed.data);
    ids.add(parsed.data.id);
    names.add(parsed.data.name.toLowerCase());
  }
  return {
    ...base,
    enabled: value.enabled === true,
    autoHeadroom: value.autoHeadroom !== false,
    gains: gains.success ? gains.data : base.gains,
    presets,
  };
}

export function matchingEqPreset(
  gains: number[],
  presets: readonly EqPreset[],
): EqPreset | undefined {
  return presets.find((preset) =>
    preset.gains.every((gain, index) => Math.abs(gain - gains[index]) < 0.001),
  );
}

export function saveEqPreset(
  settings: EqSettings,
  preset: EqPreset,
  replaceId?: string,
): EqSettings {
  const next = eqPresetSchema.parse(preset);
  if (replaceId && !settings.presets.some((p) => p.id === replaceId))
    throw new Error("This custom preset no longer exists.");
  const occupied = [...BUILTIN_EQ_PRESETS, ...settings.presets.filter((p) => p.id !== replaceId)];
  if (occupied.some((p) => p.name.toLowerCase() === next.name.toLowerCase()))
    throw new Error("A preset with this name already exists.");
  if (!replaceId && occupied.some((p) => p.id === next.id))
    throw new Error("This preset ID is already in use.");
  if (!replaceId && settings.presets.length >= 100)
    throw new Error("You can save up to 100 custom presets.");
  return {
    ...settings,
    presets: replaceId
      ? settings.presets.map((p) => (p.id === replaceId ? { ...next, id: replaceId } : p))
      : [...settings.presets, next],
  };
}

/** RBJ peaking coefficients, matching Web Audio's peaking filter definition. */
export function peakingCoefficients(frequency: number, gain: number, sampleRate: number): number[] {
  if (frequency >= sampleRate / 2 || gain === 0) return [1, 0, 0, 1, 0, 0];
  const a = 10 ** (gain / 40);
  const w = (2 * Math.PI * frequency) / sampleRate;
  const alpha = Math.sin(w) / (2 * EQ_Q);
  const cosine = -2 * Math.cos(w);
  return [1 + alpha * a, cosine, 1 - alpha * a, 1 + alpha / a, cosine, 1 - alpha / a];
}

export function eqResponseDb(gains: number[], sampleRate: number, frequencies: number[]): number[] {
  const coefficients = EQ_FREQUENCIES.map((f, i) => peakingCoefficients(f, gains[i], sampleRate));
  return frequencies.map((frequency) => {
    const w = (2 * Math.PI * frequency) / sampleRate;
    const c1 = Math.cos(w),
      c2 = Math.cos(2 * w),
      s1 = Math.sin(w),
      s2 = Math.sin(2 * w);
    return coefficients.reduce((db, [b0, b1, b2, a0, a1, a2]) => {
      const numerator = (b0 + b1 * c1 + b2 * c2) ** 2 + (b1 * s1 + b2 * s2) ** 2;
      const denominator = (a0 + a1 * c1 + a2 * c2) ** 2 + (a1 * s1 + a2 * s2) ** 2;
      return db + 10 * Math.log10(Math.max(numerator / denominator, 1e-30));
    }, 0);
  });
}

export function eqFrequencyGrid(sampleRate: number, points = 512): number[] {
  const maximum = Math.min(20000, (sampleRate / 2) * 0.999);
  return Array.from({ length: points }, (_, i) => 20 * (maximum / 20) ** (i / (points - 1)));
}

export function eqHeadroomDb(gains: number[], sampleRate: number): number {
  if (gains.every((gain) => gain === 0)) return 0;
  // Dense sampling, plus exact band centers. This reduces clipping risk, not a true-peak guarantee.
  const response = eqResponseDb(gains, sampleRate, [
    ...eqFrequencyGrid(sampleRate, 2048),
    ...EQ_FREQUENCIES.filter((f) => f < sampleRate / 2),
  ]);
  return -(Math.max(0, ...response) + 1);
}

export type EqStatus = {
  state: "disabled" | "waiting" | "enabled" | "suspended" | "cast" | "unavailable";
  message: string;
  sampleRate: number;
  headroomDb: number;
};
