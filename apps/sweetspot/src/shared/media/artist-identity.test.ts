import { describe, expect, it } from "vitest";
import { selectArtist } from "./artist-identity";
const song = {
  videoId: "song",
  counterpart: "video",
  artist: "Artist",
  channelId: "artist-channel",
};
describe("artist banner identity", () => {
  it("keeps the request when video credits a different uploader, and when returning to song", () => {
    const initial = selectArtist(null, song);
    const refreshed = selectArtist(initial, song);
    const video = selectArtist(refreshed, {
      videoId: "video",
      artist: "Label",
      channelId: "label-channel",
    });
    expect(video.request).toBe(initial.request);
    expect(selectArtist(video, song).request).toBe(initial.request);
  });
  it("does not reload for another song by the same artist or their Topic channel", () => {
    const initial = selectArtist(null, song);
    expect(
      selectArtist(initial, { ...song, videoId: "another", artist: "Artist - Topic" }).request,
    ).toBe(initial.request);
  });
  it("requests a different artist when the song actually changes", () => {
    const initial = selectArtist(null, song);
    const next = selectArtist(initial, {
      videoId: "other",
      artist: "Other",
      channelId: "other-channel",
    });
    expect(next.request).toEqual({ videoId: "other", channelId: "other-channel", artist: "Other" });
  });
});
