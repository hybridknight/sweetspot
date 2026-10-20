import { afterEach, describe, expect, it, vi } from "vitest";
import { SpectrumStream } from "./spectrum-stream";
import { emptySpectrum } from "@shared/skins/spectrum";
afterEach(() => vi.useRealTimers());
describe("audio spectrum stream", () => {
  it("samples at 10 Hz, publishes changing frames, and has one timer", () => {
    vi.useFakeTimers();
    let value = 0;
    const sample = vi.fn(() => ({ available: true, bands: Array(32).fill((value++ % 10) / 10) }));
    const publish = vi.fn();
    const stream = new SpectrumStream(sample, publish);
    stream.setEnabled(true);
    stream.setEnabled(true);
    vi.advanceTimersByTime(1000);
    expect(sample).toHaveBeenCalledTimes(11);
    expect(publish).toHaveBeenCalledTimes(11);
    expect(vi.getTimerCount()).toBe(1);
    stream.setEnabled(false);
    vi.advanceTimersByTime(1000);
    expect(sample).toHaveBeenCalledTimes(11);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("sends silence once and resumes after audio changes or restart", () => {
    vi.useFakeTimers();
    let frame = emptySpectrum();
    const publish = vi.fn();
    const stream = new SpectrumStream(() => frame, publish);
    stream.setEnabled(true);
    vi.advanceTimersByTime(1000);
    expect(publish).toHaveBeenCalledTimes(1);
    frame = { available: true, bands: Array(32).fill(0.5) };
    vi.advanceTimersByTime(100);
    expect(publish).toHaveBeenCalledTimes(2);
    stream.setEnabled(false);
    stream.setEnabled(true);
    expect(publish).toHaveBeenCalledTimes(3);
    stream.setEnabled(false);
  });
});
