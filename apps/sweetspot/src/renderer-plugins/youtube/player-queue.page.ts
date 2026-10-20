import { QueueIdentity, queueRenderer, type SkinQueuePlaylist, type SkinQueueSnapshot } from "@shared/skins/queue";
import { resolveYtmStore } from "./ytm-store";
import { getPagePlayerApi } from "./world0/context";
import { readPlaybackModes } from "./playback-modes.page";
const identity = new QueueIdentity();
function queueText(raw: unknown): string {
  const text = raw as { simpleText?: unknown; runs?: { text?: unknown }[] } | null;
  return (typeof raw === "string" ? raw
    : typeof text?.simpleText === "string" ? text.simpleText
    : Array.isArray(text?.runs) ? text.runs.map(run => typeof run?.text === "string" ? run.text : "").join("")
    : "").trim().slice(0, 300);
}
/** Native "Playing from" metadata is held separately from watch-next contents. */
function playlistFromQueueHeader(header: unknown, playlistId?: string): SkinQueuePlaylist | null {
  if (!playlistId || !header || typeof header !== "object") return null;
  // A single song/video's generated radio is not a specific chosen playlist.
  if (/^RDAMV[MS]/i.test(playlistId)) return null;
  const title = queueText((header as { subtitle?: unknown }).subtitle);
  return title ? { id: playlistId.slice(0, 200), title } : null;
}
/** Read the playing queue's metadata, never the playlist currently being browsed. */
function playbackPlaylist(response: unknown, activePlaylistId?: string): SkinQueuePlaylist | null {
  const pending = [response];
  const seen = new WeakSet<object>();
  for (let visited = 0; pending.length && visited < 5000; visited++) {
    const node = pending.shift();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    const record = node as Record<string, unknown>;
    const panel = record.playlistPanelRenderer as Record<string, unknown> | undefined;
    if (panel && typeof panel === "object") {
      const id = typeof panel.playlistId === "string" ? panel.playlistId : "";
      const title = queueText(panel.titleText) || queueText(panel.title);
      if (id && title && (!activePlaylistId || id === activePlaylistId)) return { id: id.slice(0, 200), title };
      // Queue rows cannot contain the playing playlist's header.
      continue;
    }
    for (const value of Object.values(record)) {
      if (value && typeof value === "object") pending.push(value);
    }
  }
  return null;
}
export function playerQueue(): SkinQueueSnapshot {
  const store = resolveYtmStore();
  const state = store?.getState();
  const api = getPagePlayerApi();
  const id = (api?.getVideoData?.() as { video_id?: string } | undefined)?.video_id ?? "";
  const raw = state?.queue?.items ?? [];
  const items = identity.snapshot(raw, id);
  const selected = items.find(item => item.current);
  const endpoint = selected ? queueRenderer(raw[selected.index]).navigationEndpoint?.watchEndpoint : undefined;
  const playlistId = typeof endpoint?.playlistId === "string" ? endpoint.playlistId : undefined;
  const playlist = playlistFromQueueHeader(state?.queue?.header, playlistId) ?? playbackPlaylist(
    state?.playerPage?.playerPageWatchNextResponse,
    playlistId,
  );
  return { items, count: items.length, storeHooked: !!store, playlist, playback: readPlaybackModes() };
}
export function playQueueOccurrence(input: { id: string; revision: string }) {
  const item = playerQueue().items.find((i) => i.id === input.id && i.revision === input.revision);
  if (!item) throw new Error("The queue changed. Choose the track again.");
  const host = queueHost();
  if (host) {
    // Select the native occurrence without navigating/rebuilding the playlist.
    host.dispatch({ type: "SET_INDEX", payload: item.index });
    return { ok: true };
  }
  const raw = resolveYtmStore()?.getState().queue?.items?.[item.index];
  const endpoint = queueRenderer(raw).navigationEndpoint;
  // Preserve the native playlist/index context, including repeated songs. The queue-add
  // endpoint is intentionally not used: it enqueues instead of selecting an occurrence.
  if (!endpoint?.watchEndpoint)
    throw new Error("This track is not available for playback yet. Try again in full mode.");
  document.dispatchEvent(new CustomEvent("yt-navigate", { detail: { endpoint } }));
  return { ok: true };
}

function queueHost() {
  const host = document.querySelector("#queue") as
    | (Element & { dispatch?: (action: unknown) => void })
    | null;
  return typeof host?.dispatch === "function"
    ? (host as Element & { dispatch: (action: unknown) => void })
    : null;
}

export function moveQueueOccurrence(input: { id: string; revision: string; toIndex: number }) {
  const before = playerQueue();
  const item = before.items.find(
    (entry) => entry.id === input.id && entry.revision === input.revision,
  );
  if (!item) throw new Error("The queue changed. Try moving the track again.");
  if (!Number.isInteger(input.toIndex) || input.toIndex < 0 || input.toIndex >= before.items.length)
    throw new Error("That queue position is no longer available.");
  if (item.index === input.toIndex) return before;
  const host = queueHost();
  if (!host) throw new Error("The queue is reconnecting. Try again in a moment.");
  // Use the same action as native queue dragging. It retains selection, shuffle,
  // continuation and playlist context in the live full-mode queue.
  host.dispatch({ type: "MOVE_ITEM", payload: { fromIndex: item.index, toIndex: input.toIndex } });
  const after = playerQueue();
  if (after.items[input.toIndex]?.id !== item.id)
    throw new Error("The queue could not be reordered. Try again.");
  return after;
}

export function queueOccurrenceAction(input: {
  id: string;
  revision: string;
  action: "playNext" | "remove";
}) {
  const before = playerQueue();
  const item = before.items.find(
    (entry) => entry.id === input.id && entry.revision === input.revision,
  );
  if (!item) throw new Error("The queue changed. Open the song menu again.");
  if (input.action === "playNext") {
    const current = before.items.findIndex((entry) => entry.current);
    if (current < 0) throw new Error("Play a song first, then choose Play next.");
    if (item.current) return before;
    // A move from before the current song shifts its index down by one.
    return moveQueueOccurrence({ ...input, toIndex: item.index < current ? current : current + 1 });
  }
  const host = queueHost();
  if (!host) throw new Error("The queue is reconnecting. Try again in a moment.");
  host.dispatch({ type: "REMOVE_ITEM", payload: item.index });
  const after = playerQueue();
  if (after.items.some((entry) => entry.id === item.id))
    throw new Error("The track could not be removed. Try again.");
  return after;
}
