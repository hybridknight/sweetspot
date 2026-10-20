import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { isCachableThumbUrl } from "@shared/media/appThumbUrl";
import {
  selectArtist,
  type ArtistSelection,
  type ArtistTrack,
} from "@shared/media/artist-identity";

type ArtworkRequest = { videoId: string; channelId: string };

/** Warm both the normal query cache and browser image cache without changing the banner. */
function PreloadArtistArtwork({ request }: { request: ArtworkRequest }) {
  const artwork = trpc.player.artistArtwork.useQuery(request, {
    staleTime: 15 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    const source = artwork.data;
    if (!source || !isCachableThumbUrl(source)) return;
    const preload = new Image();
    preload.referrerPolicy = "no-referrer";
    preload.src = source;
  }, [artwork.data]);
  return null;
}

/** Preserve the displayed image until its replacement has finished loading. */
export function ArtistBanner({
  track,
  nextTracks = [],
  className = "pop-artist-banner",
}: {
  track: ArtistTrack | null;
  nextTracks?: ArtworkRequest[];
  className?: string;
}) {
  const [selection, setSelection] = useState<ArtistSelection | null>(null);
  const [image, setImage] = useState<string | null>(null);
  useEffect(() => {
    if (track) setSelection((previous) => selectArtist(previous, track));
  }, [track?.videoId, track?.channelId, track?.artist, track?.counterpart]);
  const artwork = trpc.player.artistArtwork.useQuery(
    selection
      ? { ...selection.request, artist: selection.track.artist }
      : { videoId: "", channelId: "" },
    { enabled: !!selection, staleTime: 15 * 60_000, retry: 1, keepPreviousData: true },
  );
  useEffect(() => {
    if (artwork.isFetching || artwork.isPreviousData || !selection) return;
    const source = artwork.data;
    if (!source || !isCachableThumbUrl(source)) {
      setImage(null);
      return;
    }
    let cancelled = false;
    const preload = new Image();
    preload.referrerPolicy = "no-referrer";
    preload.onload = () => {
      if (!cancelled) setImage(source);
    };
    preload.onerror = () => {
      if (!cancelled) setImage(null);
    };
    preload.src = source;
    return () => {
      cancelled = true;
    };
  }, [artwork.data, artwork.isFetching, artwork.isPreviousData, selection?.request]);
  return (
    <div className={className} aria-hidden="true">
      {nextTracks.map((request) => (
        <PreloadArtistArtwork key={`${request.videoId}:${request.channelId}`} request={request} />
      ))}
      {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <UserRound />}
    </div>
  );
}
