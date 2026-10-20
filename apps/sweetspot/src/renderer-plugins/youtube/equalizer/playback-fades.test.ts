import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackFades } from "./playback-fades";

class Media extends EventTarget {
  paused = false;
  ended = false;
  seeking = false;
  isConnected = true;
  readyState = 4;
  currentTime = 30;
  duration = 100;
  playbackRate = 1;
  loop = false;
  currentSrc = "blob:current-song";
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });
  play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  });
}
function fixture() {
  const param = {
    value: 1,
    cancelAndHoldAtTime() {},
    cancelScheduledValues() {},
    setValueAtTime(value: number) {
      this.value = value;
    },
    linearRampToValueAtTime(value: number) {
      this.value = value;
    },
  };
  const context = {
    state: "running",
    get currentTime() {
      return Date.now() / 1000;
    },
    createGain: () => ({ gain: param }),
  } as unknown as AudioContext;
  const media = new Media();
  const fades = new PlaybackFades(context);
  fades.bind(media as unknown as HTMLMediaElement);
  return { fades, media, context };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

describe("transport fade ownership", () => {
  it("keeps the outgoing song silent until the delayed next source loads", async () => {
    const { fades, media } = fixture();
    const skip = fades.run("skip", vi.fn());
    await vi.advanceTimersByTimeAsync(150);
    await skip;
    expect(fades.gain.gain.value).toBe(0);
    for (const event of ["timeupdate", "playing", "durationchange", "waiting", "playing"]) {
      media.dispatchEvent(new Event(event));
      expect(fades.gain.gain.value).toBe(0);
    }
    media.currentSrc = "blob:next-song";
    media.currentTime = 0;
    media.dispatchEvent(new Event("loadstart"));
    media.dispatchEvent(new Event("playing"));
    expect(fades.gain.gain.value).toBe(1);
  });
  it("does not schedule an old song's end fade during the skip handoff", async () => {
    const { fades, media } = fixture();
    fades.configure({ smoothPlayPause: true, songFades: true, songFadeSeconds: 1 });
    const skip = fades.run("skip", vi.fn());
    await vi.advanceTimersByTimeAsync(150);
    await skip;
    media.currentTime = 99.5;
    media.dispatchEvent(new Event("timeupdate"));
    expect(fades.gain.gain.value).toBe(0);
    media.currentTime = 30;
    media.dispatchEvent(new Event("timeupdate"));
    expect(fades.gain.gain.value).toBe(0);
  });
  it("song fades do not force a pause delay when smooth transport is off", async () => {
    const { fades, media } = fixture();
    fades.configure({ smoothPlayPause: false, songFades: true, songFadeSeconds: 2 });
    await fades.run("pause", media.pause);
    expect(media.pause).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("holds a paused skip and resume until the replacement source is ready", async () => {
    const { fades, media } = fixture();
    media.pause();
    await fades.run("skip", vi.fn());
    await fades.run("play", media.play);
    fades.configure({ smoothPlayPause: true, songFades: true, songFadeSeconds: 1 });
    media.dispatchEvent(new Event("timeupdate"));
    expect(fades.gain.gain.value).toBe(0);
    media.currentTime = 0;
    media.dispatchEvent(new Event("seeking"));
    media.dispatchEvent(new Event("seeked"));
    expect(fades.gain.gain.value).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("recovers sound when a skip fails or does not change the source", async () => {
    const { fades } = fixture();
    const failure = fades.run("skip", () => {
      throw new Error("skip failed");
    });
    const rejected = expect(failure).rejects.toThrow("skip failed");
    await vi.advanceTimersByTimeAsync(150);
    await rejected;
    expect(fades.gain.gain.value).toBe(1);
    const noOp = fades.run("skip", vi.fn());
    await vi.advanceTimersByTimeAsync(150);
    await noOp;
    expect(fades.gain.gain.value).toBe(0);
    await vi.advanceTimersByTimeAsync(2100);
    expect(fades.gain.gain.value).toBe(1);
  });
  it("a failed older skip cannot unmute a newer handoff", async () => {
    const { fades, media } = fixture();
    let rejectOld!: (reason: Error) => void;
    const old = fades.run(
      "skip",
      () =>
        new Promise((_, reject) => {
          rejectOld = reject;
        }),
    );
    const rejected = expect(old).rejects.toThrow("old skip failed");
    await vi.advanceTimersByTimeAsync(150);
    const next = fades.run("skip", vi.fn());
    await vi.advanceTimersByTimeAsync(150);
    await next;
    rejectOld(new Error("old skip failed"));
    await rejected;
    media.dispatchEvent(new Event("timeupdate"));
    expect(fades.gain.gain.value).toBe(0);
    fades.detach();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("pauses after the envelope rather than before it", async () => {
    const { fades, media } = fixture();
    const pause = fades.run("pause", media.pause);
    await vi.advanceTimersByTimeAsync(50);
    expect(media.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    await pause;
    expect(media.pause).toHaveBeenCalledOnce();
  });
  it("a newer play cancels a pending pause", async () => {
    const { fades, media } = fixture();
    const pause = fades.run("pause", media.pause);
    await vi.advanceTimersByTimeAsync(20);
    await fades.run("play", media.play);
    await vi.advanceTimersByTimeAsync(300);
    expect(await pause).toEqual({ cancelled: true });
    expect(media.pause).not.toHaveBeenCalled();
    expect(media.paused).toBe(false);
  });
  it("source replacement cannot execute a stale pause", async () => {
    const { fades, media } = fixture();
    const pause = fades.run("pause", media.pause);
    fades.bind(new Media() as unknown as HTMLMediaElement);
    await vi.advanceTimersByTimeAsync(300);
    expect(await pause).toEqual({ cancelled: true });
    expect(media.pause).not.toHaveBeenCalled();
  });
  it("turning fades off completes an explicitly requested pause", async () => {
    const { fades, media } = fixture();
    const pause = fades.run("pause", media.pause);
    fades.configure({ smoothPlayPause: false, songFades: false, songFadeSeconds: 1 });
    await pause;
    expect(media.pause).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300);
    expect(media.pause).toHaveBeenCalledOnce();
  });
  it("casts and suspended contexts use immediate transport", async () => {
    const { fades, media, context } = fixture();
    fades.configure({ smoothPlayPause: true, songFades: true, songFadeSeconds: 1 }, true);
    await fades.run("pause", media.pause);
    expect(media.pause).toHaveBeenCalledOnce();
    fades.configure({ smoothPlayPause: true, songFades: false, songFadeSeconds: 1 });
    (context as any).state = "suspended";
    await fades.run("play", media.play);
    expect(media.play).toHaveBeenCalledOnce();
  });
  it("seeking cancels an obsolete skip", async () => {
    const { fades, media } = fixture();
    const skip = vi.fn();
    const result = fades.run("skip", skip);
    media.dispatchEvent(new Event("seeking"));
    await vi.advanceTimersByTimeAsync(300);
    expect(await result).toEqual({ cancelled: true });
    expect(skip).not.toHaveBeenCalled();
  });
  it("an external pause remains immediate and is never resumed", async () => {
    const { fades, media } = fixture();
    const pending = fades.run("pause", media.pause);
    media.pause();
    await vi.advanceTimersByTimeAsync(300);
    expect(await pending).toEqual({ cancelled: true });
    expect(media.pause).toHaveBeenCalledOnce();
    expect(media.play).not.toHaveBeenCalled();
  });
});
