import { afterEach, describe, expect, it, vi } from "vitest";
import { animateSpectrum, spectrumPaths } from "./spectrum-animation";

const bands = (value: number) => Array(32).fill(value);
afterEach(() => vi.useRealTimers());
describe("spectrum animation budget", () => {
  it("uses at most 20 paints per second even with 120 Hz input", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let target = bands(0.5);
    const paint = vi.fn();
    const animation = animateSpectrum({ wave: true, playing: true, target: () => target, paint });
    for (let i = 0; i < 120; i++) {
      target = bands(i % 2 ? 0.8 : 0.2);
      animation.wake();
      vi.advanceTimersByTime(1000 / 120);
    }
    expect(paint.mock.calls.length).toBeGreaterThan(0);
    expect(paint.mock.calls.length).toBeLessThanOrEqual(21);
    expect(paint.mock.calls.every(([paths]) => paths.tips === "")).toBe(true);
    animation.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops all timers during silence and wakes for the next sample", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    let target = bands(0);
    const paint = vi.fn();
    const animation = animateSpectrum({ wave: false, playing: true, target: () => target, paint });
    vi.advanceTimersByTime(1000);
    expect(vi.getTimerCount()).toBe(0);
    target = bands(1);
    animation.wake();
    vi.advanceTimersByTime(500);
    expect(paint.mock.lastCall?.[0].bars).not.toBe("");
    target = bands(0);
    animation.wake();
    vi.advanceTimersByTime(5000);
    expect(paint.mock.lastCall?.[0].bars).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    animation.dispose();
  });
  it("goes idle on a steady tone instead of recomputing identical graphics", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const paint = vi.fn();
    const animation = animateSpectrum({
      wave: true,
      playing: true,
      target: () => bands(0.5),
      paint,
    });
    vi.advanceTimersByTime(2000);
    expect(paint.mock.lastCall?.[0].bars).not.toBe("");
    expect(vi.getTimerCount()).toBe(0);
    const calls = paint.mock.calls.length;
    vi.advanceTimersByTime(2000);
    expect(paint).toHaveBeenCalledTimes(calls);
    animation.dispose();
  });
  it("does not loop or show stale audio while paused", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    const paint = vi.fn();
    const animation = animateSpectrum({
      wave: true,
      playing: false,
      target: () => bands(1),
      paint,
    });
    vi.advanceTimersByTime(5000);
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.lastCall?.[0].bars).toBe("");
    expect(vi.getTimerCount()).toBe(0);
    animation.dispose();
  });
  it("keeps centered wave bars and segmented classic geometry", () => {
    const wave = spectrumPaths(bands(1), bands(1), true);
    expect(wave.bars.startsWith("M0 4L")).toBe(true);
    expect(wave.bars).toContain("L480 4V44");
    expect(wave.bars.match(/M/g)).toHaveLength(1);
    expect(wave.bars.match(/L/g)).toHaveLength(64);
    const classic = spectrumPaths(bands(1), bands(1), false);
    expect(classic.bars.startsWith("M0 4h3v39h-3Z")).toBe(true);
    expect(classic.tips.match(/M/g)).toHaveLength(32);
  });
});
