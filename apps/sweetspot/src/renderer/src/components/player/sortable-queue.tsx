import { HoverTooltip } from "@/components/ui/tooltip";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, MoreVertical, Play, ListStart, Trash2 } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import type { SkinQueueItem } from "@shared/skins/queue";

/** One queue interaction for every built-in and imported skin. */
export function SortableQueue({
  items,
  busy,
  onMove,
  onAction,
  onPlay,
  children,
}: {
  items: SkinQueueItem[];
  busy: boolean;
  onMove: (item: SkinQueueItem, toIndex: number) => Promise<void>;
  onAction: (item: SkinQueueItem, action: "playNext" | "remove") => Promise<void>;
  onPlay: (item: SkinQueueItem) => Promise<void>;
  children: (item: SkinQueueItem) => ReactNode;
}) {
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<{
    item: SkinQueueItem;
    startY: number;
    y: number;
    active: boolean;
    slot: number;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; slot: number } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuHandle] = useState(() => Menu.createHandle<SkinQueueItem>());
  const [announcement, setAnnouncement] = useState("");
  const suppressClick = useRef(false);
  const moving = useRef(false);
  const latest = useRef(items);
  latest.current = items;
  const cancel = () => {
    drag.current = null;
    setFeedback(null);
  };
  // Polling or native full-mode edits must never change the meaning of an active drag.
  useEffect(() => {
    if (drag.current && drag.current.item.revision !== items[0]?.revision) {
      suppressClick.current = drag.current.active;
      cancel();
      setAnnouncement("The queue changed. Try moving the track again.");
    }
  }, [items]);
  useEffect(() => {
    if (!feedback) return;
    let frame = 0;
    const tick = () => {
      const active = drag.current;
      const element = list.current;
      if (!active || !element) return;
      const bounds = element.getBoundingClientRect();
      const edge = 32;
      const speed =
        active.y < bounds.top + edge
          ? -Math.min(12, (bounds.top + edge - active.y) / 3)
          : active.y > bounds.bottom - edge
            ? Math.min(12, (active.y - bounds.bottom + edge) / 3)
            : 0;
      if (speed) {
        element.scrollTop += speed;
        locate(active.y);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [!!feedback]);
  function locate(y: number) {
    const active = drag.current;
    if (!active || !list.current) return;
    const rows = Array.from(list.current.querySelectorAll<HTMLElement>(":scope > li"));
    const slot = rows.findIndex((row) => {
      const bounds = row.getBoundingClientRect();
      return y < bounds.top + bounds.height / 2;
    });
    active.slot = slot < 0 ? rows.length : slot;
    setFeedback({ id: active.item.id, slot: active.slot });
  }
  async function move(item: SkinQueueItem, toIndex: number) {
    if (busy || moving.current || toIndex === item.index) return;
    moving.current = true;
    setMenuOpen(false);
    try {
      await onMove(item, toIndex);
      setAnnouncement(`${item.title} moved to position ${toIndex + 1} of ${items.length}.`);
    } catch (error) {
      setAnnouncement(error instanceof Error ? error.message : "Could not move the track.");
    } finally {
      moving.current = false;
      requestAnimationFrame(() => {
        const row = Array.from(list.current?.children ?? []).find(
          (row) => (row as HTMLElement).dataset.queueId === item.id,
        );
        row?.querySelector<HTMLButtonElement>(".queue-menu-trigger")?.focus();
      });
    }
  }
  async function action(item: SkinQueueItem, kind: "playNext" | "remove" | "play") {
    if (busy || moving.current) return;
    moving.current = true;
    setMenuOpen(false);
    try {
      if (kind === "play") await onPlay(item);
      else await onAction(item, kind);
      setAnnouncement(
        kind === "remove"
          ? `${item.title} removed from the queue.`
          : kind === "playNext"
            ? `${item.title} will play next.`
            : `Playing ${item.title}.`,
      );
    } catch (error) {
      setAnnouncement(
        error instanceof Error ? error.message : "Could not complete the queue action.",
      );
    } finally {
      moving.current = false;
      requestAnimationFrame(() => {
        const rows = Array.from(list.current?.children ?? []) as HTMLElement[];
        const row =
          rows.find((row) => row.dataset.queueId === item.id) ??
          rows[Math.min(item.index, rows.length - 1)];
        row?.querySelector<HTMLButtonElement>(".queue-menu-trigger")?.focus();
      });
    }
  }
  return (
    <>
      <span className="queue-sr-only" id="queue-reorder-help">
        Drag a song row to reorder. Use the song menu for queue actions, or Alt plus Up or Down to
        move it.
      </span>
      <span className="queue-sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
      <Menu.Root handle={menuHandle} open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        {({ payload }) => (
          <>
            <ol
              ref={list}
              className="queue-list"
              aria-label="Play queue"
              aria-busy={busy}
              onKeyDownCapture={(event) => {
                // Handle reorder shortcuts before the menu trigger's ArrowUp/Down behavior.
                if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                const row = (event.target as HTMLElement).closest<HTMLElement>("[data-queue-id]");
                const item = items.find((item) => item.id === row?.dataset.queueId);
                if (!item) return;
                event.preventDefault();
                event.stopPropagation();
                const to = item.index + (event.key === "ArrowUp" ? -1 : 1);
                if (to >= 0 && to < items.length) void move(item, to);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  suppressClick.current = !!drag.current?.active;
                  cancel();
                  setMenuOpen(false);
                  return;
                }
                if (event.altKey || event.ctrlKey || event.metaKey || menuOpen) return;
                const target = event.target as HTMLButtonElement;
                if (!target.matches(".queue-play")) return;
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    ".queue-play:not(:disabled)",
                  ),
                );
                const current = buttons.indexOf(target);
                const next =
                  event.key === "ArrowDown"
                    ? current + 1
                    : event.key === "ArrowUp"
                      ? current - 1
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? buttons.length - 1
                          : event.key === "PageDown"
                            ? current + 10
                            : event.key === "PageUp"
                              ? current - 10
                              : null;
                if (next === null || current < 0) return;
                event.preventDefault();
                buttons[Math.max(0, Math.min(buttons.length - 1, next))]?.focus();
              }}
            >
              {items.map((item, index) => (
                <li
                  key={item.id}
                  data-queue-id={item.id}
                  data-menu-open={menuOpen && payload?.id === item.id}
                  className={`queue-row${feedback?.id === item.id ? " queue-dragging" : ""}${feedback?.slot === index ? " queue-drop-before" : ""}${feedback?.slot === items.length && index === items.length - 1 ? " queue-drop-after" : ""}`}
                  onDragStart={(event) => event.preventDefault()}
                  onClickCapture={(event) => {
                    if (suppressClick.current && event.detail > 0) {
                      suppressClick.current = false;
                      event.preventDefault();
                      event.stopPropagation();
                    }
                  }}
                  onPointerDown={(event) => {
                    const target = event.target as HTMLElement;
                    suppressClick.current = false;
                    if (
                      event.button !== 0 ||
                      busy ||
                      moving.current ||
                      menuOpen ||
                      target.closest(".queue-menu-trigger")
                    )
                      return;
                    // Capture on the playback button so a simple click keeps its normal action.
                    target.closest<HTMLElement>(".queue-play")?.setPointerCapture(event.pointerId);
                    drag.current = {
                      item,
                      startY: event.clientY,
                      y: event.clientY,
                      active: false,
                      slot: index,
                    };
                  }}
                  onPointerMove={(event) => {
                    const active = drag.current;
                    if (!active) return;
                    active.y = event.clientY;
                    if (!active.active && Math.abs(event.clientY - active.startY) > 4) {
                      active.active = true;
                      setMenuOpen(false);
                    }
                    if (active.active) locate(event.clientY);
                  }}
                  onPointerUp={(event) => {
                    const active = drag.current;
                    if (!active) return;
                    const bounds = list.current!.getBoundingClientRect();
                    const inside =
                      event.clientX >= bounds.left &&
                      event.clientX <= bounds.right &&
                      event.clientY >= bounds.top &&
                      event.clientY <= bounds.bottom;
                    suppressClick.current = active.active;
                    cancel();
                    if (
                      active.active &&
                      inside &&
                      active.item.revision === latest.current[0]?.revision
                    )
                      void move(
                        active.item,
                        active.slot > active.item.index ? active.slot - 1 : active.slot,
                      );
                  }}
                  onPointerCancel={() => {
                    suppressClick.current = true;
                    cancel();
                  }}
                  onLostPointerCapture={cancel}
                >
                  {children(item)}
                  <HoverTooltip content="Song actions">
                    <Menu.Trigger
                      handle={menuHandle}
                      payload={item}
                      className="queue-menu-trigger"
                      aria-label={`Song actions for ${item.title}`}
                      aria-describedby="queue-reorder-help"
                      disabled={busy}
                    >
                      <MoreVertical size={18} aria-hidden="true" />
                    </Menu.Trigger>
                  </HoverTooltip>
                </li>
              ))}
            </ol>
            <Menu.Portal
              container={list.current?.closest<HTMLElement>(".skinned-player") ?? undefined}
            >
              <Menu.Positioner
                className="queue-menu-positioner"
                align="end"
                side="bottom"
                sideOffset={5}
                positionMethod="fixed"
              >
                <Menu.Popup
                  className="queue-song-menu"
                  aria-label={payload ? `Actions for ${payload.title}` : "Song actions"}
                >
                  {payload && (
                    <>
                      <Menu.Item
                        className="queue-menu-item"
                        disabled={busy || !payload.videoId}
                        onClick={() => void action(payload, "play")}
                      >
                        <Play size={16} aria-hidden="true" />
                        Play now
                      </Menu.Item>
                      <Menu.Item
                        className="queue-menu-item"
                        disabled={busy || payload.current || !items.some((item) => item.current)}
                        onClick={() => void action(payload, "playNext")}
                      >
                        <ListStart size={16} aria-hidden="true" />
                        Play next
                      </Menu.Item>
                      <div className="queue-menu-separator" role="separator" />
                      <Menu.Item
                        className="queue-menu-item"
                        disabled={busy || payload.index === 0}
                        onClick={() => void move(payload, payload.index - 1)}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                        Move up
                      </Menu.Item>
                      <Menu.Item
                        className="queue-menu-item"
                        disabled={busy || payload.index === items.length - 1}
                        onClick={() => void move(payload, payload.index + 1)}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                        Move down
                      </Menu.Item>
                      <div className="queue-menu-separator" role="separator" />
                      <Menu.Item
                        className="queue-menu-item"
                        disabled={busy}
                        onClick={() => void action(payload, "remove")}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                        Remove from queue
                      </Menu.Item>
                    </>
                  )}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </>
        )}
      </Menu.Root>
    </>
  );
}
