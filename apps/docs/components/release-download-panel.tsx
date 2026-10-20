"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRightIcon, ChevronDownIcon, DownloadIcon } from "lucide-react";
import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { cn } from "@/lib/cn";
import {
  type DownloadPlatform,
  type LatestRelease,
  type ReleaseAsset,
  type ReleaseChannel,
  DOWNLOAD_PLATFORMS,
  RELEASE_CHANNEL_LABELS,
  formatBytes,
  formatReleaseDate,
  getDownloadLabel,
  getReleaseNotes,
  getReleasesUrl,
  groupDownloadsByPlatform,
  listVisibleReleaseChannels,
} from "@/lib/downloads";

function detectPlatform(): DownloadPlatform | null {
  if (typeof navigator === "undefined") {
    return "windows";
  }

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string; architecture?: string };
    }
  ).userAgentData;
  const platform = uaData?.platform?.toLowerCase();
  if (platform) {
    if (platform.includes("mac")) return "macos";
    if (platform.includes("win")) return "windows";
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  return null;
}

function pickDefaultChannel(
  releases: Partial<Record<ReleaseChannel, LatestRelease | null>>,
): ReleaseChannel {
  return listVisibleReleaseChannels(releases)[0] ?? "stable";
}

interface ReleaseDownloadPanelProps {
  releases: Partial<Record<ReleaseChannel, LatestRelease | null>>;
}

export function ReleaseDownloadPanel({ releases }: ReleaseDownloadPanelProps) {
  const [platform, setPlatform] = useState<DownloadPlatform>("windows");
  const [channel, setChannel] = useState<ReleaseChannel>(() => pickDefaultChannel(releases));
  const [channelOpen, setChannelOpen] = useState(false);
  const channelMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    if (detectedPlatform) {
      setPlatform(detectedPlatform);
    }
  }, []);

  useEffect(() => {
    const visible = listVisibleReleaseChannels(releases);
    if (!visible.includes(channel)) {
      setChannel(visible[0] ?? "stable");
    }
  }, [releases, channel]);

  useEffect(() => {
    if (!channelOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!channelMenuRef.current?.contains(event.target as Node)) {
        setChannelOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setChannelOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [channelOpen]);

  const availableChannels = useMemo(() => listVisibleReleaseChannels(releases), [releases]);

  const release = releases[channel] ?? null;
  const groups = useMemo(
    () => (release ? groupDownloadsByPlatform(release.assets) : null),
    [release],
  );

  if (!release || !groups) {
    return (
      <aside className="ss-release-panel">
        <p className="text-sm font-medium text-fd-muted-foreground">Latest release</p>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Release feed unavailable</h2>
        <p className="mt-2 text-sm text-fd-muted-foreground">
          Open GitHub Releases for Windows and macOS builds.
        </p>
        <a
          href={getReleasesUrl()}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "secondary" }), "mt-5 gap-2 px-4 py-2")}
        >
          Browse releases
          <ArrowUpRightIcon className="size-4" />
        </a>
      </aside>
    );
  }

  const notes = getReleaseNotes(release.body, null);
  const assets = groups[platform];
  const platformLabel = DOWNLOAD_PLATFORMS.find((item) => item.id === platform)?.label;

  return (
    <aside className="ss-release-panel">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative" ref={channelMenuRef}>
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={channelOpen}
            onClick={() => setChannelOpen((open) => !open)}
            className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-foreground"
          >
            Latest release
            <ChevronDownIcon
              className={cn("size-3.5 transition-transform", channelOpen && "rotate-180")}
            />
          </button>
          {channelOpen ? (
            <ul
              role="listbox"
              aria-label="Release channel"
              className="absolute left-0 top-full z-20 mt-1.5 min-w-40 overflow-hidden rounded-xl border bg-fd-popover py-1 shadow-lg"
            >
              {availableChannels.map((item) => {
                const itemRelease = releases[item];
                const selected = item === channel;
                return (
                  <li key={item} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => {
                        setChannel(item);
                        setChannelOpen(false);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-fd-accent",
                        selected && "bg-fd-accent/60",
                      )}
                    >
                      <span className="font-medium text-fd-foreground">
                        {RELEASE_CHANNEL_LABELS[item]}
                      </span>
                      {itemRelease ? (
                        <span className="text-xs text-fd-muted-foreground">
                          {itemRelease.tag_name}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
        <span className="rounded-full border bg-fd-secondary px-2.5 py-1 text-xs font-medium">
          {release.tag_name}
        </span>
      </div>

      <h3 className="ss-release-title">Get Sweet Spot</h3>
      <p className="ss-release-date">
        Version {release.tag_name.replace(/^v/, "")} · {formatReleaseDate(release.published_at)}
        {channel !== "stable" ? ` · ${RELEASE_CHANNEL_LABELS[channel]}` : ""}
      </p>

      <div
        role="group"
        aria-label="Download platform"
        className="ss-platform-picker"
      >
        {DOWNLOAD_PLATFORMS.map((item) => {
          const selected = platform === item.id;
          const count = groups[item.id].length;

          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setPlatform(item.id)}
              className={cn(
                "flex-1 cursor-pointer rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-fd-background text-fd-foreground shadow-sm"
                  : "text-fd-muted-foreground hover:text-fd-foreground",
              )}
            >
              {item.label}
              {count === 0 ? (
                <span className="ml-1 text-[10px] font-normal opacity-70">soon</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {assets.length > 0 ? (
        <div className="ss-download-options" key={`${channel}-${platform}`}>
          {platform === "macos" ? (
            <div className="ss-mac-groups">
              {([
                { arch: "arm64", title: "Apple Silicon", description: "For Macs with an M-series chip" },
                { arch: "x64", title: "Intel", description: "For Macs with an Intel processor" },
                { arch: "universal", title: "Universal", description: "For Apple Silicon and Intel Macs" },
              ] as const).map(({ arch, title, description }) => {
                const downloads = assets.filter((asset) => getDownloadLabel(asset).arch === arch);
                if (!downloads.length) return null;
                return (
                  <section className="ss-chip-group" key={arch} aria-label={`${title} downloads`}>
                    <h4>{title}</h4>
                    <p>{description}</p>
                    <ul>
                      {downloads.map((asset, index) => (
                        <DownloadRow key={asset.name} asset={asset} primary={index === 0} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <section className="ss-windows-download" aria-label="Windows downloads">
              <h4>Windows</h4>
              <p>For 64-bit Windows computers</p>
              <ul>
                {assets.map((asset, index) => (
                  <DownloadRow key={asset.name} asset={asset} primary={index === 0} />
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <p className="ss-release-notice">{platformLabel} builds are not available in this release yet.</p>
      )}

      {release.distribution_notice ? (
        <p className="ss-release-notice">{release.distribution_notice}</p>
      ) : null}

      {notes.length > 0 ? (
        <details className="ss-release-notes" key={channel}>
          <summary>Release notes <ChevronDownIcon size={14} /></summary>
          <ul>
            {notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>
      ) : null}

      <div className="ss-release-links">
        {release.checksum_url ? (
          <a href={release.checksum_url} className="inline-flex text-xs text-fd-muted-foreground hover:text-fd-foreground hover:underline">
            SHA-256 checksums
          </a>
        ) : null}

        <a
          href={release.html_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
        >
          View on GitHub
          <ArrowUpRightIcon className="size-3.5" />
        </a>
      </div>
    </aside>
  );
}

function DownloadRow({ asset, primary = false }: { asset: ReleaseAsset; primary?: boolean }) {
  const label = getDownloadLabel(asset);
  const title = label.kind === "macos-dmg" ? "Download DMG"
    : label.kind === "macos-zip" ? "Download ZIP"
    : label.kind === "macos-pkg" ? "Download PKG"
    : "Download installer";

  return (
    <li>
      <a
        href={asset.browser_download_url}
        aria-label={`${title} — ${label.platform === "macos" ? label.description : "Windows"}`}
        className={cn("ss-download-file", primary && "ss-download-file-primary")}
      >
        <DownloadIcon size={15} />
        <span>{title}</span>
        <span className="ss-download-size">{formatBytes(asset.size)}</span>
      </a>
    </li>
  );
}
