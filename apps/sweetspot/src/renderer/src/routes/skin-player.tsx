import { HoverTooltip } from "@/components/ui/tooltip";
import { skinMediaGeometry, skinMediaPolicy } from "@shared/skins/media";
import type { PlaybackModes } from "@shared/ytm/playback-modes";
import { nextQueueItems } from "@shared/skins/queue";
import { ArtistBanner } from "@/components/player/artist-banner";
import { skinPresentation } from "@shared/skins/presentation";
import { skinFontCss } from "@shared/skins/fonts";
import { CoverImage } from "@shared/media/cover-image";
import { GlassBackdrop } from "@/components/player/glass-art";
import { PanelResizer } from "@/components/player/panel-resizer";
import { Spectrum, DigitalClock } from "@/components/player/spectrum";
import { SortableQueue } from "@/components/player/sortable-queue";
import { SkinSlider } from "@/components/player/skin-slider";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Image as ImageIcon,
  Equal,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Pin,
  Play,
  Settings2,
  Shuffle,
  SkipBack,
  SkipForward,
  Video,
  Volume2,
  Repeat,
  Repeat1,
  ListMusic,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useTrack, useTrackState } from "@/hooks/use-track";
import { EqualizerPanel } from "@/components/equalizer-panel";

import { VectorArt } from "@/components/player/vector-art";
import { resolveSkin } from "@shared/skins/builtins";
import { validateSkinValues, type SkinPackage, type SkinValues } from "@shared/skins/schema";
import { isCachableThumbUrl } from "@shared/media/appThumbUrl";
import "@/components/player/player.css";
export const Route = createFileRoute("/skin-player")({ component: PlayerPage });
const time = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${Math.floor(Math.max(0, seconds) % 60)
    .toString()
    .padStart(2, "0")}`;
function IconButton({
  label,
  children,
  onClick,
  pressed,
  disabled,
  skin,
  shortcut,
  tooltipDelay,
}: {
  shortcut?: string;
  tooltipDelay?: number;
  label: string;
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  skin?: SkinPackage;
}) {
  const shortcutLabel = (window as unknown as { playerPlatform?: string }).playerPlatform === "darwin"
    ? shortcut?.replace("Alt+", "⌥").replace("ArrowLeft", "←").replace("ArrowRight", "→")
    : shortcut;
  return (
    <HoverTooltip content={shortcutLabel ? `${label} · ${shortcutLabel}` : label} delay={tooltipDelay}>
      <button
        type="button"
        className="skin-icon"
        aria-label={label}
        aria-keyshortcuts={shortcut}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
      >
        {skin && <VectorArt skin={skin} kind="button" />}
        <span className="skin-icon-glyph" aria-hidden="true">
          {children}
        </span>
      </button>
    </HoverTooltip>
  );
}
function SkinModule({
  skin,
  name,
  title,
  children,
  hidden = false,
  actions,
  resizer,
}: {
  skin: SkinPackage;
  name: string;
  title: string;
  children: ReactNode;
  hidden?: boolean;
  actions?: ReactNode;
  resizer?: ReactNode;
}) {
  return (
    <section className={`skin-module module-${name}`} hidden={hidden}>
      <VectorArt skin={skin} kind="panel" />
      <header className="module-title">
        <span
          className={
            name === "transport" || (name === "queue" && skin.theme.finish === "glass")
              ? "player-brand"
              : undefined
          }
        >
          {title}
        </span>
        <span className="module-groove" />
        {actions && <div className="module-actions">{actions}</div>}
      </header>
      <div className="module-content">{children}</div>
      {resizer}
    </section>
  );
}
function PlayerPage() {
  const utils = trpc.useUtils();
  const catalog = trpc.player.catalog.useQuery();
  const transparency = trpc.player.transparency.useMutation();
  const appearance = trpc.player.openAppearance.useMutation();
  const videoMode = trpc.player.videoMode.useMutation();
  const heightWrite = trpc.player.resizeHeight.useMutation();
  const requestedHeights = useRef(new Set<number>());
  const frozenPanels = useRef<Record<string, number> | null>(null);
  const viewport = useRef({ width: innerWidth, height: innerHeight });
  const [panelHeights, setPanelHeights] = useState<Record<string, number> | null>(null);
  const [panelRows, setPanelRows] = useState<string | undefined>();
  const manuallySizedPanels = useRef(new Set<string>());
  const rememberedHeights = useRef<Record<string, number>>({});
  const pendingPanelLayout = useRef<Record<string, number> | null>(null);
  const preferences = trpc.player.preferences.useMutation();
  const full = trpc.player.fullMode.useMutation(),
    pin = trpc.player.pin.useMutation(),
    minimize = trpc.player.minimize.useMutation();
  const track = useTrack(),
    state = useTrackState();
  const queue = trpc.player.queue.useQuery(undefined, { refetchInterval: 2500 });
  const repeatMode = queue.data?.playback?.repeatMode;
  const shuffleEnabled = queue.data?.playback?.shuffleEnabled;
  function updatePlaybackModes(playback: PlaybackModes) {
    utils.player.queue.setData(undefined, current => current ? { ...current, playback } : current);
    void utils.player.queue.invalidate();
  }
  const playlistHeading = queue.data?.playlist?.title ?? track?.video.author ?? "Your music";
  const upcoming = nextQueueItems(queue.data?.items ?? [], track?.video.videoId ?? "");
  const nextArtists = upcoming
    .flatMap((item) =>
      item.videoId && item.channelId ? [{ videoId: item.videoId, channelId: item.channelId }] : [],
    )
    .filter(
      (item, index, items) =>
        items.findIndex(
          (other) => other.videoId === item.videoId && other.channelId === item.channelId,
        ) === index,
    );
  const moveQueue = trpc.player.moveQueue.useMutation();
  const queueAction = trpc.player.queueAction.useMutation();
  const playQueue = trpc.player.playQueue.useMutation(),
    toggle = trpc.track.togglePlay.useMutation(),
    next = trpc.track.next.useMutation(),
    prev = trpc.track.prev.useMutation(),
    seek = trpc.track.seek.useMutation(),
    shuffle = trpc.track.shuffle.useMutation({ onSuccess: updatePlaybackModes }),
    repeat = trpc.track.repeat.useMutation({ onSuccess: updatePlaybackModes });
  const volumeQuery = trpc.track.volume.useMutation(),
    volumeWrite = trpc.track.volume.useMutation();
  const minimumHeight = trpc.player.minimumHeight.useMutation();
  const minimumRef = useRef(minimumHeight.mutateAsync);
  minimumRef.current = minimumHeight.mutateAsync;
  const bounds = trpc.player.videoBounds.useMutation();
  const boundsRef = useRef(bounds.mutateAsync);
  boundsRef.current = bounds.mutateAsync;
  const [draft, setDraft] = useState<SkinValues | null>(null),
    [error, setError] = useState(""),
    [pinned, setPinned] = useState(false),
    [volume, setVolume] = useState(65),
    [mediaView, setMediaView] = useState<{ skinId: string; view: "artwork" | "video" } | null>(null),
    [eqOpen, setEqOpen] = useState<boolean | null>(null),
    [queueOpen, setQueueOpen] = useState<boolean | null>(null),
    [mediaOpen, setMediaOpen] = useState<boolean | null>(null);
  const slot = useRef<HTMLDivElement>(null),
    skin = resolveSkin(catalog.data?.selected ?? "", catalog.data?.custom ?? []);
  trpc.player.onCatalog.useSubscription(undefined, {
    onData: (next) => utils.player.catalog.setData(undefined, next),
  });
  trpc.player.onPreview.useSubscription(undefined, {
    onData: (next) => setDraft(next?.id === skin.id ? next.values : null),
  });
  const album = skin.layout.arrangement === "album";
  const spotlight = skin.layout.arrangement === "spotlight";
  const adaptiveLayout = album || spotlight;
  // Resolve the skin's initial surface in the same render as its catalog, rather
  // than briefly requesting Video before an effect switches to Artwork.
  const view = mediaView?.skinId === skin.id
    ? mediaView.view
    : adaptiveLayout || skin.theme.finish === "pop" ? "artwork" : "video";
  const setView = (view: "artwork" | "video") => setMediaView({ skinId: skin.id, view });
  useEffect(() => {
    setMediaView(current => current?.skinId === skin.id ? current : null);
  }, [skin.id]);
  const values = draft ?? validateSkinValues(skin, catalog.data?.preferences[skin.id]);
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const videoAvailable =
    !!track && (!track.meta.isAudioExclusive || !!track.meta.counterpartVideoId);
  const mediaVisible = skin.settings.some((s) => s.target === "videoExpanded")
    ? targets.videoExpanded !== false
    : (mediaOpen ?? true);
  const showVideo = view === "video" && mediaVisible && videoAvailable;
  const videoDimensions = trpc.player.videoDimensions.useQuery(undefined, {
    enabled: album && showVideo,
    refetchInterval: album && showVideo ? 1000 : false,
  });
  const eqVisible = skin.settings.some((s) => s.target === "eqExpanded")
      ? targets.eqExpanded !== false
      : (eqOpen ?? true),
    queueVisible = skin.settings.some((s) => s.target === "queueExpanded")
      ? targets.queueExpanded !== false
      : (queueOpen ?? true);
  const visibleModules = skin.layout.modules.filter(
    (name) =>
      name === "transport" ||
      (name === "queue" ? queueVisible : name === "equalizer" ? eqVisible : mediaVisible),
  );
  const videoModeRef = useRef(videoMode.mutateAsync);
  videoModeRef.current = videoMode.mutateAsync;
  useEffect(() => {
    // Missing track metadata means "still loading", not a request for Song mode.
    if (!catalog.data || !track) return;
    // The selected surface owns the native Song/Video mode, not just its visibility.
    const apply = () => {
      void videoModeRef.current({ enabled: showVideo }).catch((e) => setError(e.message));
    };
    apply();
    window.addEventListener("player-mode-shown", apply);
    return () => window.removeEventListener("player-mode-shown", apply);
  }, [showVideo, !!catalog.data, !!track]);
  const mediaSizing = () => {
    const area = slot.current;
    const module = area?.closest<HTMLElement>(".module-media");
    const outer = (element: HTMLElement | null | undefined) => {
      if (!element) return 0;
      const style = getComputedStyle(element);
      if (style.display === "none" || style.position === "absolute") return 0;
      return (
        element.offsetHeight +
        (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0)
      );
    };
    const insets = (element: HTMLElement | null | undefined) => {
      if (!element) return 0;
      const style = getComputedStyle(element);
      return [
        style.paddingTop,
        style.paddingBottom,
        style.borderTopWidth,
        style.borderBottomWidth,
      ].reduce((sum, value) => sum + (parseFloat(value) || 0), 0);
    };
    const width = area?.clientWidth || Math.max(240, innerWidth - 32);
    const geometry = skinMediaGeometry(skin, width);
    const dimensions = videoDimensions.data;
    if (album && showVideo && dimensions && dimensions.width > 0 && dimensions.height > 0) {
      geometry.defaultHeight = width * dimensions.height / dimensions.width;
      geometry.minimum = Math.min(geometry.minimum, geometry.defaultHeight);
    }
    const areaStyle = area ? getComputedStyle(area) : null;
    const chrome =
      outer(module?.querySelector<HTMLElement>(".module-title")) +
      outer(module?.querySelector<HTMLElement>(".module-content .media-tabs")) +
      outer(module?.querySelector<HTMLElement>(".studio-artist")) +
      outer(module?.querySelector<HTMLElement>(".panel-resizer")) +
      insets(module) +
      insets(module?.querySelector<HTMLElement>(".module-content")) +
      (parseFloat(areaStyle?.marginTop ?? "0") || 0) +
      (parseFloat(areaStyle?.marginBottom ?? "0") || 0);
    return { ...geometry, chrome, panelMinimum: Math.ceil(chrome + geometry.minimum) };
  };
  // Measure app-owned controls, not a skin-supplied size. Reserve their natural height
  // and let media/playlist use the remaining space without clipping the EQ.
  useLayoutEffect(() => {
    let last = 0;
    const outerHeight = (element: HTMLElement | null) => {
      if (!element) return 0;
      const style = getComputedStyle(element);
      return (
        element.offsetHeight +
        (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0)
      );
    };
    const measure = () => {
      const transport = document.querySelector<HTMLElement>(".module-transport");
      const eq = document.querySelector<HTMLElement>(".module-equalizer .module-content");
      const eqTitle = document.querySelector<HTMLElement>(".module-equalizer .module-title");
      const eqHeight = eqVisible ? outerHeight(eq) + outerHeight(eqTitle) + 10 : 0;
      document
        .querySelector<HTMLElement>(".skinned-player")
        ?.style.setProperty("--eq-min", `${Math.ceil(eqHeight)}px`);
      const media = mediaSizing();
      const root = document.querySelector<HTMLElement>(".skinned-player");
      root?.style.setProperty("--video-min", `${media.minimum}px`);
      root?.style.setProperty("--video-default", `${media.defaultHeight}px`);
      root?.style.setProperty("--media-min", `${media.panelMinimum}px`);
      root?.style.setProperty("--media-default", `${Math.ceil(media.chrome + media.defaultHeight)}px`);
      const availableMediaHeight = window.screen.availHeight - Math.max(0, window.outerHeight - innerHeight) -
        outerHeight(document.querySelector(".studio-chrome")) - outerHeight(transport) - eqHeight - 20;
      const mediaHeight = mediaVisible
        ? album && showVideo
          ? Math.min(Math.ceil(media.chrome + media.defaultHeight), Math.max(media.panelMinimum, availableMediaHeight))
          : media.panelMinimum
        : 0;
      if (album && showVideo) root?.style.setProperty("--media-min", `${mediaHeight}px`);
      const queueHeight = queueVisible
        ? outerHeight(document.querySelector(".module-queue .module-title")) +
          outerHeight(document.querySelector(".queue-info")) +
          outerHeight(document.querySelector(".glass-playlist-header")) +
          outerHeight(document.querySelector(".studio-playlist-header")) +
          (skin.theme.finish === "pop" ? 3 * 60 + 24 : 100)
        : 0;
      root?.style.setProperty("--queue-min", `${queueHeight}px`);
      const columns =
        skin.theme.finish !== "metal" &&
        skin.layout.arrangement === "columns" &&
        innerWidth >= 720 &&
        eqVisible &&
        queueVisible;
      const adaptiveHeight =
        outerHeight(document.querySelector(".studio-chrome")) +
        outerHeight(transport) +
        eqHeight +
        (innerWidth >= 720
          ? Math.max(mediaHeight, queueHeight, 260)
          : (mediaVisible ? Math.max(180, mediaHeight) : 0) +
            (queueVisible ? Math.max(180, queueHeight) : 0)) +
        20;
      const height = Math.min(
        2400,
        Math.max(
          480,
          Math.ceil(
            adaptiveLayout
              ? adaptiveHeight
              : outerHeight(transport) +
                  mediaHeight +
                  (columns ? Math.max(eqHeight, queueHeight) : eqHeight + queueHeight) +
                  8,
          ),
        ),
      );
      if (height === last) return;
      last = height;
      // Minimum-size growth is an app resize, just like a panel resize. A delayed
      // native notification must not be treated as a user drag and added to the
      // playlist when a hidden panel is being restored at the same time.
      if (height > innerHeight) requestedHeights.current.add(height);
      void minimumRef.current(height).catch(() => {});
    };
    const observer = new ResizeObserver(measure);
    for (const selector of [
      ".module-transport",
      ".module-equalizer .module-content",
      ".module-media .module-title",
      ".media-tabs",
      ".player-media",
      ".studio-artist",
      ".queue-info",
    ]) {
      const element = document.querySelector(selector);
      if (element) observer.observe(element);
    }
    window.addEventListener("resize", measure);
    document.fonts.addEventListener("loadingdone", measure);
    const shown = () => {
      last = 0;
      measure();
    };
    window.addEventListener("player-mode-shown", shown);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      document.fonts.removeEventListener("loadingdone", measure);
      window.removeEventListener("player-mode-shown", shown);
    };
  }, [
    skin.id,
    skin.layout.arrangement,
    skin.theme.finish,
    eqVisible,
    mediaVisible,
    queueVisible,
    targets.font,
    targets.headingFont,
    showVideo,
    videoDimensions.data?.width,
    videoDimensions.data?.height,
  ]);
  const desktopTransparent =
    skin.theme.finish === "glass" &&
    targets.transparentBackground !== false &&
    (window as unknown as { playerPlatform?: string }).playerPlatform === "darwin";
  const transparencyRef = useRef(transparency.mutateAsync);
  transparencyRef.current = transparency.mutateAsync;
  useLayoutEffect(() => {
    document.documentElement.dataset.playerTransparent = String(desktopTransparent);
    const apply = () => {
      void transparencyRef.current({ enabled: desktopTransparent }).catch(() => {});
    };
    apply();
    window.addEventListener("player-mode-shown", apply);
    return () => {
      delete document.documentElement.dataset.playerTransparent;
      window.removeEventListener("player-mode-shown", apply);
    };
  }, [desktopTransparent]);
  const minimumPanel = (name: string) => {
    const outer = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return 0;
      const style = getComputedStyle(element);
      return (
        element.offsetHeight +
        (parseFloat(style.marginTop) || 0) +
        (parseFloat(style.marginBottom) || 0)
      );
    };
    if (name === "equalizer")
      return parseFloat(
        document
          .querySelector<HTMLElement>(".skinned-player")
          ?.style.getPropertyValue("--eq-min") || "0",
      );
    if (name === "transport")
      return (
        outer(".module-transport .module-title") +
        outer(".module-transport .module-content") +
        (skin.theme.finish === "metal" ? 10 : 8)
      );
    if (name === "media") return mediaSizing().panelMinimum;
    return Math.max(
      120,
      outer(".module-queue .module-title") +
        outer(".queue-info") +
        outer(".glass-playlist-header") +
        (skin.theme.finish === "pop" ? 3 * 60 + 24 : 100),
    );
  };
  function resizePanel(
    name: string,
    height: number,
    retained?: Record<string, number>,
    manual = false,
  ) {
    if (manual) manuallySizedPanels.current.add(name);
    const slots = Array.from(document.querySelectorAll<HTMLElement>(".module-slot")).filter(
      (slot) => getComputedStyle(slot).display !== "none",
    );
    const heights = Object.fromEntries(
      slots.map((slot) => {
        const panel = slot.dataset.panel!;
        const measured = retained?.[panel] ?? slot.getBoundingClientRect().height;
        const newlyOpened = retained !== undefined && retained[panel] === undefined;
        // A newly shown grid item can initially measure zero while old explicit rows remain.
        // Never freeze an open panel at zero, or carry automatic empty space into transport.
        const preferred =
          panel === "transport" && !manual && !manuallySizedPanels.current.has(panel)
            ? minimumPanel(panel)
            : newlyOpened && panel === "queue"
              ? 280
              : newlyOpened && panel === "media"
                ? mediaSizing().chrome + mediaSizing().defaultHeight
                : measured > 1
                  ? measured
                  : panel === "queue"
                    ? 280
                    : minimumPanel(panel);
        return [
          panel,
          manual && panel !== name && measured > 1
            ? measured
            : Math.max(minimumPanel(panel), preferred),
        ];
      }),
    );
    const rows = Object.fromEntries(
      slots.map((slot) => [slot.dataset.panel!, Number(getComputedStyle(slot).gridRowStart)]),
    );
    const rowSizes = (values: Record<string, number>) => {
      const sizes = Array(Math.max(...Object.values(rows))).fill(0);
      for (const [panel, value] of Object.entries(values))
        sizes[rows[panel] - 1] = Math.max(sizes[rows[panel] - 1], value);
      return sizes;
    };
    heights[name] = Math.min(
      1800,
      Math.max(
        minimumPanel(name),
        name === "transport" && !manuallySizedPanels.current.has(name)
          ? minimumPanel(name)
          : height,
      ),
    );
    const layout = document.querySelector<HTMLElement>(".skin-layout")!;
    // Native window resizing is asynchronous. Derive an absolute target from the
    // panel rows, rather than adding a delta to a potentially stale innerHeight.
    const chromeHeight = Math.max(0, innerHeight - layout.getBoundingClientRect().height);
    let sizes = rowSizes(heights),
      total = sizes.reduce((sum, value) => sum + value, 0);
    const minimumRows = Math.max(0, 480 - chromeHeight);
    const screenHeight = window.screen.availHeight - Math.max(0, window.outerHeight - innerHeight);
    const maximumHeight = Math.min(2400, Math.max(480, screenHeight));
    const maximumRows = maximumHeight - chromeHeight;
    if (total < minimumRows) {
      // Keep the window's minimum height filled without changing neighbouring panels.
      const flexible = manual
        ? name
        : heights.queue !== undefined
          ? "queue"
          : heights.media !== undefined
            ? "media"
            : name;
      heights[flexible] += minimumRows - total;
      sizes = rowSizes(heights);
      total = sizes.reduce((sum, value) => sum + value, 0);
    }
    if (total > maximumRows) {
      // The queue scrolls, so it gives up space before the video or controls.
      for (const panel of [...new Set(["queue", name, "media", "equalizer", "transport"])]) {
        if (heights[panel] === undefined) continue;
        heights[panel] = Math.max(minimumPanel(panel), heights[panel] - (total - maximumRows));
        sizes = rowSizes(heights);
        total = sizes.reduce((sum, value) => sum + value, 0);
        if (total <= maximumRows) break;
      }
    }
    const targetHeight = Math.min(maximumHeight, Math.max(480, Math.ceil(total + chromeHeight)));
    requestedHeights.current.delete(targetHeight);
    if (Math.abs(targetHeight - innerHeight) > 1) requestedHeights.current.add(targetHeight);
    if (requestedHeights.current.size > 64)
      requestedHeights.current.delete(requestedHeights.current.values().next().value!);
    frozenPanels.current = heights;
    setPanelHeights(heights);
    setPanelRows(sizes.map((value) => `${value}px`).join(" "));
    void run(() => heightWrite.mutateAsync(targetHeight));
  }
  const resizePanelRef = useRef(resizePanel);
  resizePanelRef.current = resizePanel;
  useEffect(() => {
    const resize = () => {
      const previous = viewport.current;
      viewport.current = { width: innerWidth, height: innerHeight };
      if (innerWidth !== previous.width) {
        requestedHeights.current.clear();
        frozenPanels.current = null;
        setPanelHeights(null);
        setPanelRows(undefined);
        return;
      }
      // Native resize notifications may arrive long after the request. Match the
      // requested size instead of discarding every panel after an arbitrary timeout.
      const expected = [...requestedHeights.current].find(
        (height) => Math.abs(height - innerHeight) <= 1,
      );
      if (expected !== undefined) {
        for (const height of requestedHeights.current) {
          requestedHeights.current.delete(height);
          if (height === expected) break;
        }
        return;
      }
      const retained = frozenPanels.current;
      if (!retained) return;
      const panel =
        retained.queue !== undefined
          ? "queue"
          : retained.media !== undefined
            ? "media"
            : "transport";
      const delta = innerHeight - previous.height;
      if (delta) resizePanelRef.current(panel, retained[panel] + delta, retained, true);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useLayoutEffect(() => {
    if (!mediaVisible || adaptiveLayout) return;
    let frame = 0;
    const schedule = (event?: Event) => {
      cancelAnimationFrame(frame);
      if (
        !catalog.data ||
        catalog.data.hasSavedSize ||
        (event as CustomEvent | undefined)?.detail?.restoredSize
      )
        return;
      frame = requestAnimationFrame(() => {
        const area = slot.current;
        const panel = area?.closest(".module-slot");
        if (!area || !panel || area.clientWidth < 100 || innerHeight < 480) return;
        const controls = panel.getBoundingClientRect().height - area.getBoundingClientRect().height;
        resizePanel("media", controls + skinMediaGeometry(skin, area.clientWidth).defaultHeight);
      });
    };
    schedule();
    window.addEventListener("player-mode-shown", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("player-mode-shown", schedule);
    };
  }, [mediaVisible, skin.id, catalog.data?.hasSavedSize]);
  useLayoutEffect(() => {
    const retained = pendingPanelLayout.current;
    pendingPanelLayout.current = null;
    if (retained && !adaptiveLayout) {
      const panel = Array.from(document.querySelectorAll<HTMLElement>(".module-slot")).find(
        (slot) => !slot.hidden,
      )?.dataset.panel;
      if (panel)
        resizePanel(
          panel,
          retained[panel] ??
            (panel === "media"
              ? mediaSizing().chrome + mediaSizing().defaultHeight
              : minimumPanel(panel)),
          retained,
        );
    } else {
      setPanelHeights(null);
      setPanelRows(undefined);
    }
  }, [eqVisible, mediaVisible, queueVisible]);
  const panelResizer = (name: string, label: string) =>
    adaptiveLayout ? undefined : (
      <PanelResizer
        name={name}
        label={label}
        minimum={() => minimumPanel(name)}
        height={panelHeights?.[name]}
        onResize={(height) => resizePanel(name, height, undefined, true)}
      />
    );
  function togglePanel(target: "eqExpanded" | "queueExpanded" | "videoExpanded", value: boolean) {
    // Capture sizes before changing visibility; reopening restores the panel's last size.
    for (const slot of document.querySelectorAll<HTMLElement>(".module-slot"))
      if (!slot.hidden)
        rememberedHeights.current[slot.dataset.panel!] = slot.getBoundingClientRect().height;
    pendingPanelLayout.current = adaptiveLayout ? null : { ...rememberedHeights.current };
    const setting = skin.settings.find((s) => s.target === target);
    if (!setting) {
      if (target === "eqExpanded") setEqOpen(value);
      else if (target === "queueExpanded") setQueueOpen(value);
      else {
        setMediaOpen(value);
        if (value) {
          setView("video");
        }
      }
      return;
    }
    void run(async () => {
      const saved = await preferences.mutateAsync({
        id: skin.id,
        values: { ...values, [setting.key]: value },
      });
      utils.player.catalog.setData(undefined, (current) =>
        current ? { ...current, ...saved } : current,
      );
      if (target === "videoExpanded" && value) {
        setView("video");
      }
    });
  }
  useEffect(() => {
    if (!adaptiveLayout) return;
    const shortcuts = (event: KeyboardEvent) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.defaultPrevented
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, select, textarea, [contenteditable=true]")) return;
      const actions: Record<string, () => void> = {
        KeyE: () => {
          if (draft === null && !preferences.isLoading) togglePanel("eqExpanded", !eqVisible);
        },
        KeyQ: () => {
          if (draft === null && !preferences.isLoading) togglePanel("queueExpanded", !queueVisible);
        },
        KeyV: () => {
          if (draft === null && !preferences.isLoading) {
            if (!mediaVisible) togglePanel("videoExpanded", true);
            else setView(view === "video" ? "artwork" : "video");
          }
        },
        ArrowLeft: () => {
          if (track && !busy) void run(() => prev.mutateAsync());
        },
        ArrowRight: () => {
          if (track && !busy) void run(() => next.mutateAsync());
        },
      };
      if (event.altKey && actions[event.code]) {
        event.preventDefault();
        actions[event.code]();
      } else if (
        event.code === "Space" &&
        !event.altKey &&
        !target?.closest("button, a, summary") &&
        track &&
        !busy
      ) {
        event.preventDefault();
        void run(() => toggle.mutateAsync());
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  });
  const duration = state?.duration || Number(track?.meta.duration) || 0,
    progress = Math.min(duration, Math.max(0, state?.progress ?? 0));
  const art =
    track?.meta.thumbnail && isCachableThumbUrl(track.meta.thumbnail) ? track.meta.thumbnail : null;
  const busy = toggle.isLoading || next.isLoading || prev.isLoading;
  async function run(action: () => Promise<unknown>) {
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete the action.");
    }
  }
  const volumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingVolume = useRef<number | null>(null);
  const volumeWrites = useRef<Promise<unknown>>(Promise.resolve());
  const volumeRef = useRef(volumeWrite.mutateAsync);
  volumeRef.current = volumeWrite.mutateAsync;
  function flushVolume() {
    clearTimeout(volumeTimer.current);
    const v = pendingVolume.current;
    pendingVolume.current = null;
    if (v !== null) {
      volumeWrites.current = volumeWrites.current
        .catch(() => undefined)
        .then(() => volumeRef.current({ volume: v }));
      void run(() => volumeWrites.current);
    }
  }
  useEffect(() => {
    void volumeQuery
      .mutateAsync(undefined)
      .then((v) => setVolume(v.volume))
      .catch(() => {});
    return () => flushVolume();
  }, []);
  useEffect(() => {
    setDraft(null);
    setEqOpen(null);
    setQueueOpen(null);
    setMediaOpen(null);
    requestedHeights.current.clear();
    frozenPanels.current = null;
    manuallySizedPanels.current.clear();
    rememberedHeights.current = {};
    pendingPanelLayout.current = null;
    setPanelHeights(null);
    setPanelRows(undefined);
  }, [skin.id]);
  useLayoutEffect(() => {
    let last = "",
      pending = false,
      disposed = false;
    let positionFrame = 0;
    // Serial writes prevent stale layout callbacks from covering the settings or full UI.
    const publish = async () => {
      if (disposed || pending) return;
      const rect = showVideo ? slot.current?.getBoundingClientRect() : null;
      const module = slot.current?.closest(".module-media");
      const tabs = module?.querySelector<HTMLElement>(".media-tabs");
      const content = module?.querySelector(".module-content")?.getBoundingClientRect();
      const artist = module?.querySelector(".studio-artist")?.getBoundingClientRect();
      const controlsBottom = Math.max(
        module?.querySelector(".module-title")?.getBoundingClientRect().bottom ?? 0,
        tabs ? tabs.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(tabs).marginBottom) || 0) : 0,
      );
      let top = rect ? Math.max(rect.top, controlsBottom, content?.top ?? 0, 0) : 0;
      let bottom = rect ? Math.min(rect.bottom, content?.bottom ?? window.innerHeight, artist && artist.height > 0 ? artist.top : window.innerHeight, window.innerHeight) : 0;
      const left = rect ? Math.max(rect.left, content?.left ?? 0, 0) : 0;
      const right = rect ? Math.min(rect.right, content?.right ?? window.innerWidth, window.innerWidth) : 0;
      // Compact layouts can let a neighbouring control row extend beyond its
      // allocated panel. The native surface must never intercept those buttons.
      for (const controls of document.querySelectorAll(".module-transport .transport-row, .module-transport .secondary-controls")) {
        const control = controls.getBoundingClientRect();
        if (!control.width || !control.height || control.right <= left || control.left >= right || control.bottom <= top || control.top >= bottom) continue;
        if ((control.top + control.bottom) / 2 <= (top + bottom) / 2) top = Math.max(top, control.bottom + 8);
        else bottom = Math.min(bottom, control.top - 8);
      }
      const b =
        rect &&
        bottom > top && right > left
          ? { x: left, y: top, width: right - left, height: bottom - top, pictureFrame: skin.theme.finish === "pop" }
          : null;
      const signature = JSON.stringify(b);
      if (signature === last) return;
      last = signature;
      pending = true;
      try {
        await boundsRef.current(b);
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "Video could not be displayed.");
      } finally {
        pending = false;
        if (!disposed) void publish();
      }
    };
    const observer = new ResizeObserver(() => void publish());
    if (slot.current) observer.observe(slot.current);
    // ResizeObserver misses position-only shifts caused by titles, font loading,
    // centered flex layouts and CSS transitions. Keep the native view aligned
    // with the rendered slot; unchanged rectangles never produce IPC writes.
    const followPosition = () => {
      if (disposed) return;
      void publish();
      positionFrame = requestAnimationFrame(followPosition);
    };
    if (showVideo) positionFrame = requestAnimationFrame(followPosition);
    const scroll = () => void publish();
    const shown = () => {
      last = "";
      void publish();
    };
    window.addEventListener("player-mode-shown", shown);
    window.addEventListener("resize", scroll);
    window.addEventListener("scroll", scroll, true);
    void publish();
    return () => {
      disposed = true;
      cancelAnimationFrame(positionFrame);
      observer.disconnect();
      window.removeEventListener("player-mode-shown", shown);
      window.removeEventListener("resize", scroll);
      window.removeEventListener("scroll", scroll, true);
      void boundsRef.current(null).catch(() => {});
    };
  }, [showVideo, skin.id, skin.layout.arrangement, targets.queueSide, eqVisible, queueVisible]);
  const theme = skin.theme;
  const glass = theme.finish === "glass";
  const css = {
    ...skinPresentation(skin, values),
    "--skin-font": skinFontCss(targets.font ?? theme.font),
    "--skin-heading-font": skinFontCss(
      targets.headingFont ?? theme.headingFont ?? targets.font ?? theme.font,
    ),
    "--skin-width": `${skin.layout.width}px`,
    "--skin-video-backdrop": skinMediaPolicy(skin).backdrop,
    "--glass-depth": String(0.12 + Number(targets.glassOpacity ?? 45) * 0.006),
    "--media-share": "1fr",
    "--queue-share": "1fr",
  } as CSSProperties;
  const windowActions = (
    <>
      <IconButton
        label={pinned ? "Unpin player" : "Always on top"}
        pressed={pinned}
        onClick={() => void run(async () => setPinned(await pin.mutateAsync()))}
      >
        <Pin />
      </IconButton>
      <IconButton label="Skin settings" onClick={() => void run(() => appearance.mutateAsync())}>
        <Settings2 />
      </IconButton>
      <IconButton label="Full mode" onClick={() => void run(() => full.mutateAsync())}>
        <Maximize2 />
      </IconButton>
      <IconButton label="Minimize player" onClick={() => void run(() => minimize.mutateAsync())}>
        <Minimize2 />
      </IconButton>
    </>
  );
  const mediaButtons = (
    <>
      <HoverTooltip content="Album artwork">
        <button
          type="button"
          aria-label="Artwork"
          aria-pressed={view === "artwork"}
          onClick={() => setView("artwork")}
        >
          {theme.finish === "metal" ? <ImageIcon size={13} aria-hidden="true" /> : "Artwork"}
        </button>
      </HoverTooltip>
      <HoverTooltip content="Music video · Use the fullscreen button; Escape to return">
        <button
          type="button"
          aria-label="Video"
          aria-pressed={view === "video"}
          onClick={() => setView("video")}
        >
          <Video size={13} aria-hidden="true" />
          {theme.finish !== "metal" && "Video"}
        </button>
      </HoverTooltip>
    </>
  );
  const modules: Record<string, ReactNode> = {
    media: (
      <SkinModule
        skin={skin}
        name="media"
        title={showVideo ? "Video" : "Now playing"}
        actions={
          !adaptiveLayout && theme.finish === "metal" ? (
            <div className="media-tabs media-view-actions">{mediaButtons}</div>
          ) : undefined
        }
        hidden={!mediaVisible}
        resizer={panelResizer("media", "video")}
      >
        {!adaptiveLayout && theme.finish !== "metal" && (
          <div className="media-tabs">
            <span>{skin.name}</span>
            {mediaButtons}
          </div>
        )}
        <div className={`player-media ${showVideo ? "native-video" : ""}`} ref={slot}>
          {album && !showVideo && (
            <div className="studio-record" aria-hidden="true">
              <div />
            </div>
          )}
          {!showVideo && (
            <div className={`artwork-frame cover-${targets.coverShape ?? "rounded"}`}>
              <CoverImage src={art} alt="Current album artwork" className="cover" />
            </div>
          )}
          {!showVideo && view === "video" && !videoAvailable && (
            <span className="media-fallback">
              {track ? "Audio only · album artwork" : "Choose music in full mode"}
            </span>
          )}
        </div>
        {album && (
          <div className="studio-artist">
            <span>ON THE RECORD</span>
            <h2>{track?.video.author ?? "Your listening room"}</h2>
            <p>
              {track
                ? "Playing from your YouTube Music queue"
                : "Choose an album in full mode to begin"}
            </p>
          </div>
        )}
      </SkinModule>
    ),
    transport: (
      <SkinModule
        skin={skin}
        name="transport"
        resizer={panelResizer("transport", "player")}
        title={glass && queueVisible ? "Audio timeline" : `${skin.name} · Player`}
        actions={adaptiveLayout || (glass && queueVisible) ? undefined : windowActions}
      >
        <div className="track-display" data-spectrum={targets.spectrumEnabled === true}>
          {theme.finish === "pop" && (
            <ArtistBanner
              nextTracks={nextArtists}
              track={
                track
                  ? {
                      videoId: track.video.videoId,
                      channelId: track.video.channelId ?? "",
                      artist: track.video.author,
                      counterpart: track.meta.counterpartVideoId,
                    }
                  : null
              }
            />
          )}
          <span className="digital-time">
            {theme.finish === "metal" ? <DigitalClock value={time(progress)} /> : time(progress)}
          </span>
          {theme.finish === "metal" && (
            <span className="retro-status">
              {state?.playing ? "PLAY" : "PAUSE"}
              <br />
              <span>LOCAL</span>
            </span>
          )}
          {targets.spectrumEnabled === true && (
            <Spectrum playing={!!state?.playing} wave={glass || theme.finish === "pop"} />
          )}
          <div>
            <h1>{track?.video.title ?? "Nothing playing"}</h1>
            <p>{track?.video.author ?? "Your next track starts here"}</p>
          </div>
        </div>
        <div className="seek-row">
          <span>{time(progress)}</span>
          <SkinSlider
            metal={theme.finish === "metal"}
            min={0}
            max={duration || 1}
            step={1}
            value={progress}
            disabled={!duration}
            aria-label="Playback position"
            aria-valuetext={`${time(progress)} of ${time(duration)}`}
            onChange={(e) =>
              void run(() =>
                seek.mutateAsync({ time: Number(e.target.value) * 1000, type: "seek" }),
              )
            }
          />
          <span>{time(duration)}</span>
        </div>
        <div className="transport-row">
          <IconButton
            label="Previous track"
            tooltipDelay={500}
            shortcut={adaptiveLayout ? "Alt+ArrowLeft" : undefined}
            skin={skin}
            disabled={!track || busy}
            onClick={() => void run(() => prev.mutateAsync())}
          >
            <SkipBack />
          </IconButton>
          <IconButton
            label={state?.playing ? "Pause" : "Play"}
            tooltipDelay={500}
            shortcut={adaptiveLayout ? "Space" : undefined}
            skin={skin}
            disabled={!track || busy}
            onClick={() => void run(() => toggle.mutateAsync())}
          >
            {state?.playing ? <Pause /> : <Play />}
          </IconButton>
          <IconButton
            label="Next track"
            tooltipDelay={500}
            shortcut={adaptiveLayout ? "Alt+ArrowRight" : undefined}
            skin={skin}
            disabled={!track || busy}
            onClick={() => void run(() => next.mutateAsync())}
          >
            <SkipForward />
          </IconButton>
          <label className="volume-row">
            <Volume2 size={14} />
            <SkinSlider
              metal={theme.finish === "metal"}
              min={0}
              max={100}
              value={volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                pendingVolume.current = v;
                clearTimeout(volumeTimer.current);
                volumeTimer.current = setTimeout(flushVolume, 120);
              }}
              onPointerUp={flushVolume}
              onKeyUp={flushVolume}
            />
            <output>{volume}%</output>
          </label>
        </div>
        <div className="secondary-controls">
          <IconButton
            label={`Shuffle queue${shuffleEnabled == null ? "" : shuffleEnabled ? ": on" : ": off"}`}
            pressed={shuffleEnabled ?? undefined}
            disabled={!track || shuffle.isLoading || repeat.isLoading}
            onClick={() => void run(() => shuffle.mutateAsync())}
          >
            <Shuffle />
          </IconButton>
          <IconButton
            label={repeatMode === "one" ? "Repeat one (switch to repeat off)" : repeatMode === "all" ? "Repeat all (switch to repeat one)" : "Repeat off (switch to repeat all)"}
            pressed={repeatMode ? repeatMode !== "off" : undefined}
            disabled={!track || shuffle.isLoading || repeat.isLoading}
            onClick={() => void run(() => repeat.mutateAsync())}
          >
            {repeatMode === "one" ? <Repeat1 /> : <Repeat />}
          </IconButton>
          <IconButton
            label={adaptiveLayout ? "Artwork or video" : "Video panel"}
            shortcut={adaptiveLayout ? "Alt+V" : undefined}
            pressed={adaptiveLayout ? showVideo : mediaVisible}
            disabled={draft !== null || preferences.isLoading}
            onClick={() =>
              adaptiveLayout && mediaVisible
                ? setView(view === "video" ? "artwork" : "video")
                : togglePanel("videoExpanded", !mediaVisible)
            }
          >
            <Video />
          </IconButton>
          <span className="control-spacer" />
          <IconButton
            label="Equalizer"
            shortcut={adaptiveLayout ? "Alt+E" : undefined}
            pressed={eqVisible}
            disabled={draft !== null || preferences.isLoading}
            onClick={() => togglePanel("eqExpanded", !eqVisible)}
          >
            <Equal />
          </IconButton>
          <IconButton
            label="Playlist"
            shortcut={adaptiveLayout ? "Alt+Q" : undefined}
            pressed={queueVisible}
            disabled={draft !== null || preferences.isLoading}
            onClick={() => togglePanel("queueExpanded", !queueVisible)}
          >
            <ListMusic />
          </IconButton>
        </div>
      </SkinModule>
    ),
    equalizer: (
      <div className="skin-equalizer" hidden={!eqVisible}>
        <SkinModule
          skin={skin}
          name="equalizer"
          title="Equalizer"
          resizer={panelResizer("equalizer", "equalizer")}
        >
          <EqualizerPanel compact />
        </SkinModule>
      </div>
    ),
    queue: (
      <div className="skin-queue" hidden={!queueVisible}>
        <SkinModule
          skin={skin}
          name="queue"
          title={glass ? `${skin.name} · Player` : "Playlist editor"}
          actions={glass ? windowActions : undefined}
          resizer={panelResizer("queue", "playlist")}
        >
          {adaptiveLayout && (
            <div className="studio-playlist-header">
              {queue.data?.playlist && (
                <span>PLAYLIST / {queue.data.count} TRACKS</span>
              )}
              <h2>{playlistHeading}</h2>
            </div>
          )}
          {glass && (
            <div className="glass-playlist-header">
              <div>
                {queue.data?.playlist && (
                  <span className="glass-eyebrow">PLAYLIST · {queue.data.count} TRACKS</span>
                )}
                <h2>{playlistHeading}</h2>
                <p>{track?.video.author ?? "Choose music in full mode"}</p>
              </div>
              <div className={`glass-header-cover cover-${targets.coverShape ?? "rounded"}`}>
                <CoverImage src={art} alt="Current album artwork" />
              </div>
            </div>
          )}
          <div className="queue-info">
            <span>Up next</span>
            <span>{queue.data?.count ?? 0} tracks</span>
          </div>
          {queue.isError ? (
            <p role="status">Playlist is reconnecting. Playback controls remain available.</p>
          ) : queue.data?.items.length ? (
            <SortableQueue
              items={queue.data.items}
              busy={
                moveQueue.isLoading ||
                queueAction.isLoading ||
                playQueue.isLoading ||
                toggle.isLoading
              }
              onMove={async (item, toIndex) => {
                setError("");
                await utils.player.queue.cancel();
                try {
                  const result = await moveQueue.mutateAsync({
                    id: item.id,
                    revision: item.revision,
                    toIndex,
                  });
                  utils.player.queue.setData(undefined, result);
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Could not move the track.");
                  throw error;
                } finally {
                  await utils.player.queue.invalidate();
                }
              }}
              onAction={async (item, action) => {
                setError("");
                await utils.player.queue.cancel();
                try {
                  const result = await queueAction.mutateAsync({
                    id: item.id,
                    revision: item.revision,
                    action,
                  });
                  utils.player.queue.setData(undefined, result);
                } catch (error) {
                  setError(
                    error instanceof Error ? error.message : "Could not complete the queue action.",
                  );
                  throw error;
                } finally {
                  await utils.player.queue.invalidate();
                }
              }}
              onPlay={async (item) => {
                setError("");
                try {
                  if (item.current) {
                    if (!state?.playing) await toggle.mutateAsync();
                  } else {
                    await playQueue.mutateAsync({ id: item.id, revision: item.revision });
                  }
                } catch (error) {
                  setError(error instanceof Error ? error.message : "Could not play the track.");
                  throw error;
                } finally {
                  await utils.player.queue.invalidate();
                }
              }}
            >
              {(item) => (
                <button
                  type="button"
                  className={`queue-play${item.current ? " current" : ""}`}
                  aria-current={item.current ? "true" : undefined}
                  disabled={
                    moveQueue.isLoading ||
                    queueAction.isLoading ||
                    playQueue.isLoading ||
                    (adaptiveLayout && toggle.isLoading) ||
                    !item.videoId
                  }
                  onClick={() =>
                    void run(async () => {
                      if (adaptiveLayout && item.current) await toggle.mutateAsync();
                      else await playQueue.mutateAsync({ id: item.id, revision: item.revision });
                      await utils.player.queue.invalidate();
                    })
                  }
                >
                  <span>
                    {adaptiveLayout ? (
                      item.current && state?.playing ? (
                        <Pause size={14} />
                      ) : (
                        <Play size={14} />
                      )
                    ) : item.current ? (
                      <Play size={12} />
                    ) : (
                      String(item.index + 1).padStart(2, "0")
                    )}
                  </span>
                  {(glass || spotlight) && (
                    <span className="glass-track-cover" aria-hidden="true">
                      <CoverImage src={item.thumbnail || (item.current ? art : null)} />
                    </span>
                  )}
                  <span className="queue-track">
                    {theme.finish === "metal" ? (
                      <>
                        {targets.showArtist !== false && item.artist && (
                          <small>{item.artist} - </small>
                        )}
                        {item.title}
                      </>
                    ) : (
                      <>
                        {item.title}
                        {targets.showArtist !== false && item.artist && (
                          <small>{item.artist}</small>
                        )}
                      </>
                    )}
                  </span>
                  <time className="queue-duration">
                    {targets.showDurations !== false ? item.duration : ""}
                  </time>
                </button>
              )}
            </SortableQueue>
          ) : (
            <p className="empty-queue">
              Your playlist appears here when you start music in full mode.
            </p>
          )}
        </SkinModule>
      </div>
    ),
  };
  return (
    <main
      className="skinned-player"
      data-finish={targets.finish ?? "original"}
      data-material={theme.finish}
      data-arrangement={skin.layout.arrangement}
      data-transparent={desktopTransparent}
      data-font={targets.font ?? theme.font}
      data-density={targets.density ?? "comfortable"}
      data-side={targets.queueSide ?? "right"}
      style={css}
    >
      {spotlight && (
        <ArtistBanner
          nextTracks={nextArtists}
          className="spotlight-backdrop"
          track={
            track
              ? {
                  videoId: track.video.videoId,
                  channelId: track.video.channelId ?? "",
                  artist: track.video.author,
                  counterpart: track.meta.counterpartVideoId,
                }
              : null
          }
        />
      )}
      {adaptiveLayout && (
        <header className="studio-chrome">
          <div className="studio-drag-region" aria-hidden="true" />
          <span className="player-brand">
            {skin.name} <span> / {spotlight ? "In the spotlight" : "Listening room"}</span>
          </span>
          <div className="module-actions">{windowActions}</div>
        </header>
      )}
      {glass && (
        <GlassBackdrop
          tone={String(targets.glassTone ?? "plum")}
          glow={Number(targets.ambientGlow ?? 70)}
          transparent={desktopTransparent}
        />
      )}
      <div
        className="skin-layout"
        style={!adaptiveLayout && panelRows ? { gridTemplateRows: panelRows } : undefined}
        data-layout={skin.layout.arrangement}
        data-eq={eqVisible}
        data-media={mediaVisible}
        data-queue={queueVisible}
      >
        {skin.layout.modules.map((name) => (
          <div
            className={`module-slot slot-${name}`}
            key={name}
            data-panel={name}
            hidden={
              name === "queue"
                ? !queueVisible
                : name === "equalizer"
                  ? !eqVisible
                  : name === "media"
                    ? !mediaVisible
                    : false
            }
            data-first={name === visibleModules[0]}
            data-last={name === visibleModules.at(-1)}
            style={
              adaptiveLayout || panelHeights?.[name] === undefined
                ? undefined
                : { height: panelHeights[name] }
            }
          >
            {modules[name]}
          </div>
        ))}
      </div>
      {error && (
        <p className="player-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
