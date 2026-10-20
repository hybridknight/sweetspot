export type ArtistTrack = {
  videoId: string;
  channelId: string;
  artist: string;
  counterpart?: string | null;
};
export type ArtistSelection = {
  track: ArtistTrack;
  request: { videoId: string; channelId: string; artist?: string };
};
const name = (artist: string) =>
  artist
    .trim()
    .replace(/\s*-\s*Topic$/i, "")
    .toLocaleLowerCase();

/** Song/video counterparts may credit different uploaders. Keep the original artist request. */
export function selectArtist(
  previous: ArtistSelection | null,
  track: ArtistTrack,
): ArtistSelection {
  const old = previous?.track;
  const sameArtist = old && name(old.artist) !== "" && name(old.artist) === name(track.artist);
  const sameRecording =
    old &&
    (old.videoId === track.videoId ||
      old.counterpart === track.videoId ||
      track.counterpart === old.videoId);
  return {
    track: sameRecording
      ? {
          ...track,
          artist: old.artist,
          counterpart:
            old.videoId !== track.videoId ? old.videoId : (track.counterpart ?? old.counterpart),
        }
      : track,
    request:
      previous && (sameArtist || sameRecording)
        ? previous.request
        : { videoId: track.videoId, channelId: track.channelId, artist: track.artist },
  };
}

const channelId = /^UC[\w-]{20,24}$/;

export function artistBrowseId(item: unknown, videoId: string, fallback: string): string | null {
  const current = item as Record<string, any> | undefined;
  // Never borrow the previous track's artist during a player-bar update.
  if (current?.videoId === videoId) {
    const runs = current.longBylineText?.runs ?? current.shortBylineText?.runs ?? [];
    for (const run of runs) {
      const endpoint = run.navigationEndpoint?.browseEndpoint;
      const pageType =
        (endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointMusicConfig ??
          endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig)?.pageType;
      if (pageType === "MUSIC_PAGE_TYPE_ARTIST" && channelId.test(endpoint.browseId))
        return endpoint.browseId;
    }
  }
  return channelId.test(fallback) ? fallback : null;
}
