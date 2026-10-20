import { artistBrowseId } from "../media/artist-identity";
import type { PlaybackModes } from "../ytm/playback-modes";
import { isCachableThumbUrl } from "../media/appThumbUrl";
export type SkinQueueItem = {
  id: string;
  index: number;
  videoId: string;
  title: string;
  thumbnail?: string;
  artist: string;
  channelId?: string;
  duration: string;
  current: boolean;
  revision: string;
};
export type SkinQueuePlaylist = { id: string; title: string };
export type SkinQueueSnapshot = {
  items: SkinQueueItem[];
  count: number;
  storeHooked: boolean;
  playlist?: SkinQueuePlaylist | null;
  playback?: PlaybackModes;
};
/** Per-occurrence IDs: repeated video IDs are deliberately not queue identities. */
export class QueueIdentity {
  private ids = new WeakMap<object, string>();
  private sequence = 0;
  private revision = 0;
  private previous = "";
  snapshot(raw: unknown[], currentId: string): SkinQueueItem[] {
    const occurrences = new Map<string, number>();
    const items = raw.slice(0, 2000).map((item, index) => {
      const root = (item ?? {}) as Record<string, any>;
      const r = queueRenderer(root);
      let id =
        typeof r.playlistSetVideoId === "string" && r.playlistSetVideoId
          ? `native:${r.playlistSetVideoId}`
          : typeof root === "object"
            ? this.ids.get(root)
            : undefined;
      if (!id) {
        id = `q${++this.sequence}`;
        if (typeof root === "object") this.ids.set(root, id);
      }
      const count = occurrences.get(id) ?? 0;
      occurrences.set(id, count + 1);
      id += `-${count}`;
      const text = (value: any) =>
        String(
          value?.simpleText ?? value?.runs?.map((run: any) => run.text ?? "").join("") ?? "",
        ).slice(0, 300);
      const thumbnails = r.thumbnail?.thumbnails;
      const thumbnail = Array.isArray(thumbnails) ? thumbnails.at(-1)?.url : undefined;
      const videoId = String(r.videoId ?? r.navigationEndpoint?.watchEndpoint?.videoId ?? "").slice(
        0,
        100,
      );
      const channelId = artistBrowseId({ ...r, videoId }, videoId, "");
      return {
        ...(channelId ? { channelId } : {}),
        ...(typeof thumbnail === "string" && isCachableThumbUrl(thumbnail) ? { thumbnail } : {}),
        id,
        index,
        videoId,
        title: text(r.title) || "Untitled track",
        artist: text(r.shortBylineText ?? r.longBylineText),
        duration: text(r.lengthText),
        current: !!r.selected,
        revision: "",
      };
    });
    const signature = items.map((i) => `${i.id}:${i.videoId}`).join("|");
    if (signature !== this.previous) {
      this.previous = signature;
      this.revision++;
    }
    // Never mark every duplicate as current. Prefer the store's selected occurrence.
    if (!items.some((i) => i.current)) {
      const match = items.find((i) => i.videoId === currentId);
      if (match) match.current = true;
    }
    return items.map((i) => ({ ...i, revision: String(this.revision) }));
  }
}

/** YouTube Music wraps entries when a song has a video counterpart. */
export function queueRenderer(item: unknown): Record<string, any> {
  const root = (item ?? {}) as Record<string, any>;
  return (
    root.playlistPanelVideoRenderer ??
    root.playlistPanelVideoWrapperRenderer?.primaryRenderer?.playlistPanelVideoRenderer ??
    root.playlistPanelVideoWrapperRenderer?.counterpart?.[0]?.counterpartRenderer
      ?.playlistPanelVideoRenderer ??
    root
  );
}

/** Use the selected occurrence so repeated songs preload the correct successors. */
export function nextQueueItems(items: SkinQueueItem[], currentVideoId: string): SkinQueueItem[] {
  if (!currentVideoId) return [];
  const index = items.findIndex((item) => item.current);
  // Ignore queue snapshots from before the latest track change.
  if (index < 0 || items[index].videoId !== currentVideoId) return [];
  return items.slice(index + 1, index + 6);
}
