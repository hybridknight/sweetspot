import { describe, expect, it } from "vitest";
import { nextQueueItems, QueueIdentity } from "./queue";

const artist = "UCabcdefghijklmnopqrstuv";
const row = (videoId: string, selected = false) => ({
  playlistPanelVideoRenderer: {
    videoId,
    selected,
    shortBylineText: {
      runs: [
        {
          text: "Artist",
          navigationEndpoint: {
            browseEndpoint: {
              browseId: artist,
              browseEndpointContextSupportedConfigs: {
                browseEndpointMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" },
              },
            },
          },
        },
      ],
    },
  },
});

describe("next artist in the queue", () => {
  it("extracts an artist endpoint from wrapped queue entries", () => {
    const next = row("next");
    const items = new QueueIdentity().snapshot(
      [row("current", true), { playlistPanelVideoWrapperRenderer: { primaryRenderer: next } }],
      "current",
    );
    expect(nextQueueItems(items, "current")).toMatchObject([
      { videoId: "next", channelId: artist },
    ]);
  });

  it("does not use an album or an unrecognized channel as the artist", () => {
    const album = row("album");
    album.playlistPanelVideoRenderer.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointMusicConfig.pageType =
      "MUSIC_PAGE_TYPE_ALBUM";
    const invalid = row("invalid");
    invalid.playlistPanelVideoRenderer.shortBylineText.runs[0].navigationEndpoint.browseEndpoint.browseId =
      "invalid";
    const items = new QueueIdentity().snapshot([album, invalid, { videoId: "bare" }], "album");
    expect(items.every((item) => item.channelId === undefined)).toBe(true);
  });

  it("follows the selected occurrence and queue reorderings", () => {
    const identity = new QueueIdentity();
    const first = row("repeat");
    const current = row("repeat", true);
    const next = row("next");
    expect(
      nextQueueItems(identity.snapshot([first, row("wrong"), current, next], "repeat"), "repeat")[0]
        ?.videoId,
    ).toBe("next");
    expect(
      nextQueueItems(
        identity.snapshot([first, current, row("reordered"), next], "repeat"),
        "repeat",
      )[0]?.videoId,
    ).toBe("reordered");
  });

  it("warms only the next five songs and advances the window with playback", () => {
    const identity = new QueueIdentity();
    const rows = [
      row("current", true),
      ...Array.from({ length: 7 }, (_, i) => row(`next-${i + 1}`)),
    ];
    expect(
      nextQueueItems(identity.snapshot(rows, "current"), "current").map((item) => item.videoId),
    ).toEqual(["next-1", "next-2", "next-3", "next-4", "next-5"]);
    rows[0].playlistPanelVideoRenderer.selected = false;
    rows[1].playlistPanelVideoRenderer.selected = true;
    expect(
      nextQueueItems(identity.snapshot(rows, "next-1"), "next-1").map((item) => item.videoId),
    ).toEqual(["next-2", "next-3", "next-4", "next-5", "next-6"]);
    expect(
      nextQueueItems(identity.snapshot(rows.slice(0, 3), "next-1"), "next-1").map(
        (item) => item.videoId,
      ),
    ).toEqual(["next-2"]);
  });

  it("skips stale, empty and exhausted queues", () => {
    const items = new QueueIdentity().snapshot([row("current", true), row("next")], "current");
    expect(nextQueueItems(items, "new-track")).toEqual([]);
    expect(nextQueueItems(items, "")).toEqual([]);
    expect(nextQueueItems([], "current")).toEqual([]);
    expect(
      nextQueueItems(new QueueIdentity().snapshot([row("last", true)], "last"), "last"),
    ).toEqual([]);
  });
});
