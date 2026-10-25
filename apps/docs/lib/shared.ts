function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function parseRepoUrl(url: string): { owner: string; name: string } | null {
  try {
    const pathname = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
    const [owner, name] = pathname.split('/');
    if (!owner || !name) return null;
    return { owner, name };
  } catch {
    return null;
  }
}

const parsedFromUrl = (() => {
  const url = readEnv('REPO_URL') ?? readEnv('NEXT_PUBLIC_REPO_URL');
  return url ? parseRepoUrl(url) : null;
})();

const githubRepository = readEnv('GITHUB_REPOSITORY');
const githubParts = githubRepository?.includes('/')
  ? {
      owner: githubRepository.split('/')[0]!,
      name: githubRepository.split('/')[1]!,
    }
  : null;

export const repoOwner =
  readEnv('REPO_OWNER') ??
  readEnv('NEXT_PUBLIC_REPO_OWNER') ??
  parsedFromUrl?.owner ??
  githubParts?.owner ??
  'hybridknight';

export const repoName =
  readEnv('REPO_NAME') ??
  readEnv('NEXT_PUBLIC_REPO_NAME') ??
  parsedFromUrl?.name ??
  githubParts?.name ??
  'sweetspot';

export const repoTitle =
  readEnv('REPO_TITLE') ??
  readEnv('NEXT_PUBLIC_REPO_TITLE') ??
  'Sweet Spot';

export const repoUrl =
  readEnv('REPO_URL') ??
  readEnv('NEXT_PUBLIC_REPO_URL') ??
  `https://github.com/${repoOwner}/${repoName}`;

export const repoBranch =
  readEnv('REPO_BRANCH') ??
  readEnv('NEXT_PUBLIC_REPO_BRANCH') ??
  readEnv('GITHUB_REF_NAME') ??
  'main';

/** GitHub stargazer count baked in at build time (CI sets `REPO_STARS`). */
export const repoStars = (() => {
  const raw = readEnv('REPO_STARS') ?? readEnv('NEXT_PUBLIC_REPO_STARS');
  if (!raw) return null;
  const count = Number.parseInt(raw, 10);
  return Number.isFinite(count) && count >= 0 ? count : null;
})();

/** Compact star label, e.g. `128` or `1.2k`. */
export function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  const compact = count / 1000;
  const rounded = compact >= 10 ? Math.round(compact) : Math.round(compact * 10) / 10;
  return `${rounded}k`;
}

/** Display name in nav / metadata (same as REPO_TITLE). */
export const appName = repoTitle;

export const docsRoute = '/docs';
export const docsImageRoute = '/og/docs';
export const docsContentRoute = '/llms.mdx/docs';
export const changelogRoute = '/changelog';

export const siteUrl =
  readEnv('NEXT_PUBLIC_URL') ??
  (process.env.GITHUB_PAGES === 'true' || process.env.NODE_ENV === 'production'
    ? 'https://sweetspot.bkk.ooo'
    : 'http://localhost:3000');

export const brandColor = '#B52C39';
export const brandColorRgb = '181, 44, 57';

export const appTagline = 'Make room for music.';
export const appTitle = `${appName} — YouTube Music Desktop App for Mac & Windows`;
export const appDescription =
  'Enjoy YouTube Music on your desktop with Sweet Spot for Mac and Windows. Customize your player with skins, an equalizer, lyrics, and media controls.';

export const docsDescription = `Documentation for ${appName} — features, install, API, and changelog.`;

/** @deprecated use repoOwner / repoName / repoBranch */
export const gitConfig = {
  user: repoOwner,
  repo: repoName,
  branch: repoBranch,
};
