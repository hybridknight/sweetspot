import { describe, expect, it } from "vitest";
import { readPlaybackTransitions } from "./playback-transitions";

describe("playback fade preferences", () => {
  it("defaults smooth transport on and song fades off on upgrade", () => {
    expect(readPlaybackTransitions(undefined)).toEqual({
      smoothPlayPause: true,
      songFades: false,
      songFadeSeconds: 1,
    });
  });
  it("preserves explicit choices", () => {
    expect(
      readPlaybackTransitions({ smoothPlayPause: false, songFades: true, songFadeSeconds: 3 }),
    ).toEqual({ smoothPlayPause: false, songFades: true, songFadeSeconds: 3 });
  });
  it("bounds malformed and excessive durations without discarding valid switches", () => {
    expect(
      readPlaybackTransitions({ songFades: true, songFadeSeconds: Infinity }).songFadeSeconds,
    ).toBe(1);
    expect(readPlaybackTransitions({ songFadeSeconds: -1 }).songFadeSeconds).toBe(0.5);
    expect(readPlaybackTransitions({ songFadeSeconds: 100 }).songFadeSeconds).toBe(5);
  });
});
