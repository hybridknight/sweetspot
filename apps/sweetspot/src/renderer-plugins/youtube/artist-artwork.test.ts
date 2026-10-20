import { afterEach, describe, expect, it, vi } from "vitest";
import { artistBrowseId, artistHeaderImage, currentArtistArtwork } from "./artist-artwork.page";
import { resolveYtmApp, resolveYtmStore } from "./ytm-store";
vi.mock("./ytm-store", () => ({ resolveYtmApp: vi.fn(), resolveYtmStore: vi.fn() }));
const artist = "UCabcdefghijklmnopqrstuv";
const other = "UCzyxwvutsrqponmlkjihgfe";
const image = "https://lh3.googleusercontent.com/artist-banner";
const header = {
  header: {
    musicImmersiveHeaderRenderer: {
      thumbnail: {
        musicThumbnailRenderer: {
          thumbnail: {
            thumbnails: [
              { url: image + "-small", width: 100 },
              { url: image, width: 1200 },
            ],
          },
        },
      },
    },
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("artist artwork", () => {
  it("takes the largest artist header image and never a song from the contents", () => {
    expect(artistHeaderImage(header)).toBe(image);
    expect(artistHeaderImage({ contents: { thumbnails: [{ url: image }] } })).toBeNull();
    expect(
      artistHeaderImage({
        header: {
          musicImmersiveHeaderRenderer: {
            thumbnail: { thumbnails: [{ url: "https://untrusted.example/image" }] },
          },
        },
      }),
    ).toBeNull();
  });
  it("supports visual headers with separate artist backgrounds", () => {
    expect(
      artistHeaderImage({
        background: {
          musicThumbnailRenderer: {
            thumbnail: { thumbnails: [{ url: image }] },
          },
        },
      }),
    ).toBe(image);
  });
  it("uses the current artist endpoint, excluding album links and stale player metadata", () => {
    const endpoint = (id: string, pageType: string) => ({
      navigationEndpoint: {
        browseEndpoint: {
          browseId: id,
          browseEndpointContextSupportedConfigs: { browseEndpointMusicConfig: { pageType } },
        },
      },
    });
    const item = {
      videoId: "song",
      longBylineText: {
        runs: [
          endpoint("MPRE-album", "MUSIC_PAGE_TYPE_ALBUM"),
          endpoint(artist, "MUSIC_PAGE_TYPE_ARTIST"),
        ],
      },
    };
    expect(artistBrowseId(item, "song", other)).toBe(artist);
    expect(artistBrowseId(item, "next-song", other)).toBe(other);
    expect(artistBrowseId(undefined, "song", "invalid")).toBeNull();
  });
  it("shares cached lookups across tracks by the same artist without navigating", async () => {
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });
    const fetch = vi.fn().mockResolvedValue(header);
    vi.mocked(resolveYtmApp).mockReturnValue({ networkManager: { fetch } });
    const results = await Promise.all([
      currentArtistArtwork({ videoId: "one", channelId: artist }),
      currentArtistArtwork({ videoId: "two", channelId: artist }),
    ]);
    expect(results).toEqual([image, image]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/browse", { browseId: artist });
  });
  it("returns unavailable when YouTube Music cannot load the artist", async () => {
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });
    vi.mocked(resolveYtmApp).mockReturnValue({
      networkManager: { fetch: vi.fn().mockRejectedValue(new Error("offline")) },
    });
    expect(await currentArtistArtwork({ videoId: "song", channelId: other })).toBeNull();
  });
  it("uses artist queue links with the current endpoint format instead of the video uploader", async () => {
    const artistId = "UC-clMkTZa7k-FxmNgMjoCgQ";
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });
    vi.mocked(resolveYtmStore).mockReturnValue({
      dispatch: vi.fn(),
      getState: () => ({ queue: { items: [{ playlistPanelVideoRenderer: {
        videoId: "song", longBylineText: { runs: [{ text: "LE SSERAFIM", navigationEndpoint: { browseEndpoint: {
          browseId: artistId,
          browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: "MUSIC_PAGE_TYPE_ARTIST" } },
        } } }] },
      } }] } }),
    });
    const fetch = vi.fn().mockResolvedValue(header);
    vi.mocked(resolveYtmApp).mockReturnValue({ networkManager: { fetch } });
    expect(await currentArtistArtwork({ videoId: "counterpart", channelId: other, artist: "LE SSERAFIM" })).toBe(image);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/browse", { browseId: artistId });
  });
});
