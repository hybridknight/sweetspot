import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { queueRenderer } from "@shared/skins/queue";
vi.mock("./world0/context", () => ({
  getPagePlayerApi: () => ({ getVideoData: () => ({ video_id: "repeat" }) }),
}));
import {
  moveQueueOccurrence,
  playerQueue,
  playQueueOccurrence,
  queueOccurrenceAction,
} from "./player-queue.page";

const row = (id: string, selected = false) => ({
  playlistPanelVideoWrapperRenderer: {
    primaryRenderer: {
      playlistPanelVideoRenderer: {
        playlistSetVideoId: id,
        videoId: "repeat",
        selected,
        title: { simpleText: id },
        navigationEndpoint: { watchEndpoint: { videoId: "repeat", playlistId: "playlist" } },
      },
    },
  },
});
let entries: unknown[];
let watchNext: unknown;
let queueHeader: unknown;
let dispatch: ReturnType<typeof vi.fn>;
let host: { dispatch: typeof dispatch } | null;
beforeEach(() => {
  watchNext = null;
  queueHeader = null;
  entries = [row("first"), row("current", true), row("third"), row("fourth")];
  dispatch = vi.fn((action: { type: string; payload: any }) => {
    if (action.type === "MOVE_ITEM") {
      const [item] = entries.splice(action.payload.fromIndex, 1);
      entries.splice(action.payload.toIndex, 0, item);
    } else if (action.type === "SET_INDEX") {
      entries.forEach((item, index) => {
        queueRenderer(item).selected = index === action.payload;
      });
    } else if (action.type === "REMOVE_ITEM") {
      entries.splice(action.payload, 1);
    }
  });
  host = { dispatch };
  vi.stubGlobal("window", {
    __SWEETSPOT_HOOK__: {
      ytmStore: {
        getState: () => ({
          playerPage: { playerPageWatchNextResponse: watchNext },
          queue: {
            header: queueHeader,
            items: structuredClone(entries),
            shuffleEnabled: true,
            queueContextParams: "context",
          },
        }),
        dispatch,
      },
    },
  });
  vi.stubGlobal("document", { querySelector: () => host, dispatchEvent: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());
describe("native player queue reordering", () => {
  it("plays a later duplicate next without changing current playback", () => {
    const before = playerQueue();
    const after = queueOccurrenceAction({ ...before.items[3], action: "playNext" });
    expect(after.items.map((item) => item.title)).toEqual(["first", "current", "fourth", "third"]);
    expect(after.items.find((item) => item.current)?.id).toBe(before.items[1].id);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "MOVE_ITEM",
      payload: { fromIndex: 3, toIndex: 2 },
    });
  });
  it("plays an earlier occurrence next with the shifted current position", () => {
    const before = playerQueue();
    const after = queueOccurrenceAction({ ...before.items[0], action: "playNext" });
    expect(after.items.map((item) => item.title)).toEqual(["current", "first", "third", "fourth"]);
    expect(after.items[0].current).toBe(true);
  });
  it("leaves Play next on the current or already-next song alone", () => {
    const before = playerQueue();
    queueOccurrenceAction({ ...before.items[1], action: "playNext" });
    queueOccurrenceAction({ ...before.items[2], action: "playNext" });
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("removes only the selected duplicate occurrence and rejects a stale menu", () => {
    const before = playerQueue();
    const after = queueOccurrenceAction({ ...before.items[2], action: "remove" });
    expect(after.count).toBe(3);
    expect(after.items.map((item) => item.title)).toEqual(["first", "current", "fourth"]);
    expect(after.items[1]).toMatchObject({ id: before.items[1].id, current: true });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "REMOVE_ITEM", payload: 2 });
    dispatch.mockClear();
    expect(() => queueOccurrenceAction({ ...before.items[3], action: "remove" })).toThrow(
      "queue changed",
    );
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("moves a duplicate occurrence forward without changing the playing occurrence", () => {
    const before = playerQueue();
    const after = moveQueueOccurrence({ ...before.items[0], toIndex: 3 });
    expect(after.items.map((item) => item.title)).toEqual(["current", "third", "fourth", "first"]);
    expect(after.items.find((item) => item.current)?.id).toBe(before.items[1].id);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: "MOVE_ITEM",
      payload: { fromIndex: 0, toIndex: 3 },
    });
    expect(after.items[3].revision).not.toBe(before.items[0].revision);
  });
  it("moves the currently playing occurrence backward and keeps it selected", () => {
    const before = playerQueue();
    const after = moveQueueOccurrence({ ...before.items[1], toIndex: 0 });
    expect(after.items[0]).toMatchObject({
      title: "current",
      current: true,
      id: before.items[1].id,
    });
    expect(after.items.filter((item) => item.current)).toHaveLength(1);
  });
  it("selects the moved duplicate through the native index without navigation", () => {
    const before = playerQueue();
    const after = moveQueueOccurrence({ ...before.items[3], toIndex: 0 });
    dispatch.mockClear();
    playQueueOccurrence(after.items[0]);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "SET_INDEX", payload: 0 });
    expect(playerQueue().items[0]).toMatchObject({ title: "fourth", current: true });
    expect(document.dispatchEvent).not.toHaveBeenCalled();
  });
  it("rejects stale revisions and removed identities without moving another track", () => {
    const before = playerQueue();
    moveQueueOccurrence({ ...before.items[0], toIndex: 3 });
    dispatch.mockClear();
    expect(() => moveQueueOccurrence({ ...before.items[1], toIndex: 0 })).toThrow("queue changed");
    expect(() =>
      moveQueueOccurrence({ ...playerQueue().items[0], id: "missing", toIndex: 0 }),
    ).toThrow("queue changed");
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("rejects invalid destinations and leaves same-position moves alone", () => {
    const item = playerQueue().items[0];
    for (const toIndex of [-1, 4, 1.5, NaN])
      expect(() => moveQueueOccurrence({ ...item, toIndex })).toThrow("position");
    expect(moveQueueOccurrence({ ...item, toIndex: 0 }).items[0].id).toBe(item.id);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it("reports an unavailable or unresponsive native queue without claiming success", () => {
    const item = playerQueue().items[0];
    host = null;
    expect(() => moveQueueOccurrence({ ...item, toIndex: 2 })).toThrow("reconnecting");
    host = { dispatch: vi.fn() };
    expect(() => moveQueueOccurrence({ ...item, toIndex: 2 })).toThrow("could not be reordered");
  });
});

const watchResponse = (panel: Record<string, unknown>) => ({
  contents: {
    singleColumnMusicWatchNextResultsRenderer: {
      tabbedRenderer: {
        watchNextTabbedResultsRenderer: {
          tabs: [{ tabRenderer: { content: { musicQueueRenderer: { content: { playlistPanelRenderer: panel } } } } }],
        },
      },
    },
  },
});
describe("playing playlist context", () => {
  it("reads the live Playing from subtitle when the watch panel has no title", () => {
    const playlistId = "RDCLAK5uy_mIVURVO1YE570nahrgVy_MXdlF1UUELbE";
    queueHeader = { title: { runs: [{ text: "Playing from" }] }, subtitle: { runs: [{ text: "The Hit List" }] } };
    entries.forEach(entry => { queueRenderer(entry).navigationEndpoint.watchEndpoint.playlistId = playlistId; });
    watchNext = watchResponse({ playlistId, contents: entries });
    expect(playerQueue().playlist).toEqual({ id: playlistId, title: "The Hit List" });
    playQueueOccurrence(playerQueue().items[2]);
    expect(playerQueue().playlist?.title).toBe("The Hit List");
  });
  it("prefers the live queue header over an older watch-response title", () => {
    queueHeader = { subtitle: { simpleText: "Playing playlist" } };
    watchNext = watchResponse({ playlistId: "playlist", title: "Older title" });
    expect(playerQueue().playlist?.title).toBe("Playing playlist");
    queueHeader = { subtitle: { runs: [{ text: "Next playlist" }] } };
    expect(playerQueue().playlist?.title).toBe("Next playlist");
  });
  it("keeps generated song radio without a specific playlist on the artist fallback", () => {
    queueHeader = { subtitle: { simpleText: "Song radio" } };
    entries.forEach(entry => { queueRenderer(entry).navigationEndpoint.watchEndpoint.playlistId = "RDAMVMrepeat"; });
    expect(playerQueue().playlist).toBeNull();
  });
  it("keeps the playlist title when playing another occurrence or editing the queue", () => {
    watchNext = watchResponse({ playlistId: "playlist", title: "Top K-Pop Female Solo" });
    const before = playerQueue();
    expect(before.playlist).toEqual({ id: "playlist", title: "Top K-Pop Female Solo" });
    playQueueOccurrence(before.items[2]);
    expect(playerQueue().playlist).toEqual(before.playlist);
    expect(moveQueueOccurrence({ ...playerQueue().items[3], toIndex: 0 }).playlist).toEqual(before.playlist);
    expect(queueOccurrenceAction({ ...playerQueue().items[0], action: "remove" }).playlist).toEqual(before.playlist);
  });
  it.each([
    { simpleText: "Saved playlist" },
    { runs: [{ text: "Saved " }, { text: "playlist" }] },
  ])("reads a formatted playlist title: %j", titleText => {
    watchNext = watchResponse({ playlistId: "playlist", titleText });
    expect(playerQueue().playlist?.title).toBe("Saved playlist");
  });
  it("rejects stale metadata and follows the next playing playlist", () => {
    watchNext = watchResponse({ playlistId: "old-playlist", title: "Old playlist" });
    expect(playerQueue().playlist).toBeNull();
    watchNext = watchResponse({ playlistId: "new-playlist", title: "New playlist" });
    entries.forEach(entry => { queueRenderer(entry).navigationEndpoint.watchEndpoint.playlistId = "new-playlist"; });
    expect(playerQueue().playlist).toEqual({ id: "new-playlist", title: "New playlist" });
  });
  it("leaves missing playlist metadata empty rather than using a song or artist name", () => {
    expect(playerQueue().playlist).toBeNull();
    watchNext = watchResponse({ playlistId: "playlist", title: "   " });
    expect(playerQueue().playlist).toBeNull();
  });
  it("does not read an unrelated browsed playlist from the document", () => {
    watchNext = watchResponse({ playlistId: "playlist", title: "Playing playlist" });
    Object.assign(host!, { data: { title: "Unrelated browsed playlist" } });
    expect(playerQueue().playlist?.title).toBe("Playing playlist");
  });
});
