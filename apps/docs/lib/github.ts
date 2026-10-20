import { createFetch } from "@better-fetch/fetch";
import preparedRelease from "@/content/releases/1.0.2.json";
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

/** Next.js fetch keeps `next.revalidate`; better-fetch does not forward unknown init fields. */
const nextFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    next: { revalidate: 3600 },
  });

const githubRepoFetch = createFetch({
  baseURL: `https://api.github.com/repos/${repoOwner}/${repoName}`,
  throw: false as const,
  headers: {
    Accept: "application/vnd.github+json",
    "User-Agent": `${repoName}-docs`,
  },
  auth: {
    type: "Bearer",
    token: () => process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
  },
  customFetchImpl: nextFetch,
});

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
      const { data: batch, error } = await githubRepoFetch<GitHubReleaseResponse[]>("/releases", {
        query: { per_page: 30, page },
      });
      if (error || !batch?.length) {
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
  } catch {
    // Keep the prepared download catalog available when GitHub is unreachable or private.
  }

  if (releases.length === 0 && (!preparedRelease.prerelease || includePrereleases)) {
    releases.push(preparedRelease);
  }
  return releases;
}
