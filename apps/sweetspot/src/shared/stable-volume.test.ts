import { describe, expect, it } from "vitest";
import { readStableVolumeEnabled } from "./stable-volume";

describe("consistent volume preference", () => {
  it("defaults on for new and existing installations without the preference", () => {
    expect(readStableVolumeEnabled(undefined)).toBe(true);
    expect(readStableVolumeEnabled(null)).toBe(true);
  });
  it("preserves an explicit on or off preference", () => {
    expect(readStableVolumeEnabled(false)).toBe(false);
    expect(readStableVolumeEnabled(true)).toBe(true);
  });
});
