import preparedRelease from "@/content/releases/latest.json";
import {
  type LatestRelease,
  type ReleaseChannel,
  RELEASE_CHANNELS,
  getRepositoryUrl,
  listUserDownloads,
  resolveReleaseChannel,
} from "./downloads";
import { repoBranch, repoName, repoOwner } from "./shared";

export type {
  DownloadKind,
  DownloadLabel,
  DownloadPlatform,
  LatestRelease,
  ReleaseAsset,
  ReleaseChannel,
} from "./downloads";

export {
  formatBytes,
  formatReleaseDate,
  getDownloadLabel,
  getLatestReleaseUrl,
  getReleaseChannel,
  getReleaseNotes,
  getRepositoryUrl,
  getReleasesUrl,
  groupDownloadsByPlatform,
  listUserDownloads,
  pickPrimaryDownload,
  resolveReleaseChannel,
  RELEASE_CHANNELS,
  RELEASE_CHANNEL_LABELS,
} from "./downloads";

interface GitHubReleaseResponse {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
    content_type: string;
  }>;
}

// Repository releases can contain platforms/features outside the public site's scope.
const repositoryOnlyTopics =
  /\b(?:linux|appimage|flatpak|debian|ubuntu|fedora|opensuse|mpris|obs)\b|\.(?:deb|rpm)\b/i;

function mapRelease(data: GitHubReleaseResponse): LatestRelease {
  return {
    tag_name: data.tag_name,
    name: data.name && !repositoryOnlyTopics.test(data.name) ? data.name : data.tag_name,
    html_url: data.html_url,
    published_at: data.published_at,
    body:
      data.body
        ?.split("\n")
        .filter((line) => !repositoryOnlyTopics.test(line))
        .join("\n") ?? null,
    prerelease: data.prerelease,
    draft: data.draft,
    distribution_notice: data.tag_name === preparedRelease.tag_name ? preparedRelease.distribution_notice : undefined,
    checksum_url: data.assets.find((asset) => asset.name === "SHA256SUMS.txt")?.browser_download_url,
    assets: listUserDownloads(data.assets).map((asset) => ({
      name: asset.name,
      browser_download_url: asset.browser_download_url,
      size: asset.size,
      content_type: asset.content_type,
    })),
  };
}

async function fetchReleasePage(page: number): Promise<GitHubReleaseResponse[]> {
  // The catalog version changes after publication, invalidating the build cache.
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/releases?per_page=30&page=${page}&catalog=${preparedRelease.tag_name}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": `${repoName}-docs`,
  };
  const token = (process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN)?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = () => fetch(url, { headers, cache: "force-cache", signal: AbortSignal.timeout(15000) });
  let response = await request();
  // A stale build token must not hide releases from this public repository.
  if (token && [401, 403, 404].includes(response.status)) {
    delete headers.Authorization;
    response = await request();
  }
  if (!response.ok) throw new Error(`GitHub releases returned HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("GitHub releases returned an invalid response");
  return data as GitHubReleaseResponse[];
}

export function getBlobUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${getRepositoryUrl()}/blob/${repoBranch}/${normalized}`;
}

export function getTreeUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${getRepositoryUrl()}/tree/${repoBranch}/${normalized}`;
}

export type ChannelReleases = Record<ReleaseChannel, LatestRelease | null>;

export async function getLatestRelease(): Promise<LatestRelease | null> {
  const byChannel = await getLatestReleasesByChannel();
  return byChannel.stable;
}

/**
 * Latest published release per channel (stable / beta-rc / alpha).
 * Uses the releases list API so prereleases are included (unlike /releases/latest).
 * Channel comes from tag, then name, and never treats GitHub prereleases as stable.
 */
export async function getLatestReleasesByChannel(): Promise<ChannelReleases> {
  const result: ChannelReleases = {
    stable: null,
    beta: null,
    alpha: null,
  };

  const releases = await listReleases({ includePrereleases: true, maxPages: 5 });
  for (const release of releases) {
    const channel = resolveReleaseChannel(release);
    if (!channel || result[channel]) continue;
    result[channel] = release;
    if (RELEASE_CHANNELS.every((key) => result[key])) break;
  }

  return result;
}

/** Fetch published releases (skips drafts). Paginated. Includes prereleases by default. */
export async function listReleases(options?: {
  maxPages?: number;
  includePrereleases?: boolean;
}): Promise<LatestRelease[]> {
  const maxPages = options?.maxPages ?? 10;
  const includePrereleases = options?.includePrereleases ?? true;
  const releases: LatestRelease[] = [];

  try {
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await fetchReleasePage(page);
      if (!batch.length) {
        break;
      }

      for (const item of batch) {
        if (item.draft) continue;
        if (!includePrereleases && item.prerelease) continue;
        releases.push(mapRelease(item));
      }

      if (batch.length < 30) {
        break;
      }
    }
  } catch (error) {
    console.warn("Unable to fetch GitHub releases; using the saved release catalog if needed.", error);
  }

  if (releases.length === 0 && (!preparedRelease.prerelease || includePrereleases)) {
    releases.push(preparedRelease);
  }
  return releases;
}
