import { artistBrowseId } from "@shared/media/artist-identity";
export { artistBrowseId } from "@shared/media/artist-identity";
import { isCachableThumbUrl } from "@shared/media/appThumbUrl";
import { resolveYtmApp, resolveYtmStore } from "./ytm-store";
import { queueRenderer } from "@shared/skins/queue";

type Data = Record<string, any>;
const cache = new Map<string, { expires: number; request: Promise<string | null> }>();

/** Only inspect artist header art, never album or song thumbnails in the contents. */
export function artistHeaderImage(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const data = response as Data;
  const header =
    data.header?.musicImmersiveHeaderRenderer ??
    data.header?.musicVisualHeaderRenderer ??
    data.header?.musicHeaderRenderer ??
    data.header?.c4TabbedHeaderRenderer;
  const roots = [
    header?.thumbnail,
    header?.foregroundThumbnail,
    header?.banner,
    header?.avatar,
    data.background,
  ];
  for (const root of roots) {
    const images: { url: string; width: number }[] = [];
    const visit = (value: unknown, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 8) return;
      const object = value as Data;
      if (typeof object.url === "string" && isCachableThumbUrl(object.url))
        images.push({ url: object.url, width: Number(object.width) || 0 });
      for (const child of Object.values(object)) visit(child, depth + 1);
    };
    visit(root);
    if (images.length) return images.sort((a, b) => b.width - a.width)[0].url;
  }
  return null;
}

/** Use YTM's existing authenticated network client; no navigation or extra player. */
export async function currentArtistArtwork(input: { videoId: string; channelId: string; artist?: string }) {
  const bar = document.querySelector("ytmusic-player-bar") as
    | (Element & { currentItem?: unknown })
    | null;
  // Counterpart videos often belong to a label. Queue bylines retain the artist
  // browse link even after the player bar switches to the video uploader.
  const artistName = input.artist?.trim().replace(/\s*-\s*Topic$/i, "").toLocaleLowerCase();
  const queueArtist = artistName && resolveYtmStore()?.getState().queue?.items?.flatMap(item => {
    const renderer = queueRenderer(item);
    const runs = renderer?.longBylineText?.runs ?? renderer?.shortBylineText?.runs ?? [];
    return runs.filter((run: Data) => run.text?.trim().toLocaleLowerCase() === artistName)
      .map((run: Data) => artistBrowseId({ videoId: input.videoId, shortBylineText: { runs: [run] } }, input.videoId, ""))
      .filter(Boolean);
  })[0];
  const id = queueArtist || artistBrowseId(bar?.currentItem, input.videoId, input.channelId);
  const manager = resolveYtmApp()?.networkManager;
  if (!id || !manager) return null;
  const cached = cache.get(id);
  if (cached && cached.expires > Date.now()) return cached.request;
  let timeout: ReturnType<typeof setTimeout>;
  const request = Promise.race([
    manager
      .fetch("/browse", { browseId: id })
      .then(artistHeaderImage)
      .catch(() => null),
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 7000);
    }),
  ]).finally(() => clearTimeout(timeout));
  cache.set(id, { expires: Date.now() + 15 * 60_000, request });
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  const image = await request;
  // Retry missing or failed responses later, without issuing a request every track.
  if (!image && cache.get(id)?.request === request)
    cache.set(id, { expires: Date.now() + 30_000, request });
  return image;
}
