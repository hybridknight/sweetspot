# Docs site

Fumadocs site for this repository. Builds use webpack and bundled Inter fonts, without a Google Fonts download.

## Env (build-time)

| Variable | Example | Notes |
| --- | --- | --- |
| `REPO_OWNER` | from Actions | GitHub owner |
| `REPO_NAME` | from Actions | Repository name |
| `REPO_URL` | `https://github.com/owner/repo` | Parsed if owner/name omitted |
| `REPO_TITLE` | `Sweet Spot` | Display title |
| `REPO_BRANCH` | default branch | For blob/edit links |
| `REPO_STARS` | from Actions | Optional repository metadata |
| `NEXT_PUBLIC_URL` | `https://sweetspot.bkk.ooo` in production | Site URL; custom domain has no `basePath` |
| `GITHUB_TOKEN` | Actions token | Higher GitHub API rate limit |

CI sets these in `.github/workflows/docs.yml`.

## Local

```bash
pnpm deps:install
# optional: cp apps/docs/.env.docs.local.example apps/docs/.env.docs.local
pnpm docs:dev
```

Open http://localhost:3000 (no basePath).

When `NEXT_PUBLIC_URL` is unset, development uses `http://localhost:3000` and production uses `https://sweetspot.bkk.ooo`. Both serve routes at the domain root, without a `/sweetspot` prefix.

Env file: `apps/docs/.env.docs.local` (gitignored). Loaded via `next.config.mjs` / `build:pages`.

## Vercel

Import the repository with **Root Directory** set to `apps/docs`, **Framework Preset** set to Next.js, and **Node.js Version** set to 24.x. Leave the output directory override off.

Set `ENABLE_EXPERIMENTAL_COREPACK=1` and `NEXT_PUBLIC_URL` to the full public site URL in Vercel's environment variables. The checked-in `vercel.json` installs and builds the docs as a standalone project, using `apps/docs/pnpm-lock.yaml` without installing the desktop application's GitHub Packages dependencies.

To reproduce the Vercel build from `apps/docs`:

```bash
pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts
pnpm --ignore-workspace run build
```

When changing docs dependencies, update both the workspace lockfile and the standalone docs lockfile. To refresh the latter, run `pnpm install --ignore-workspace --lockfile-only --no-frozen-lockfile` from `apps/docs`.

## Static build (GitHub Pages)

```bash
REPO_OWNER=hybridknight REPO_NAME=sweetspot REPO_TITLE="Sweet Spot" \
NEXT_PUBLIC_URL=https://sweetspot.bkk.ooo \
pnpm --filter sweetspot-docs build:pages
```

The exported site includes `CNAME` for `sweetspot.bkk.ooo`. Configure that custom domain in the repository's GitHub Pages settings and point its DNS to the hosting provider before deploying.

## Current UI captures

The public screenshots come from actual app components and the rebuilt production stylesheet, rendered in an isolated Electron session. Track names and artists are sample content. No signed-in browser profile, real tokens, provider keys, or personal paths are loaded.

From the repository root, first run the production app build. Then:

```bash
node apps/sweetspot/scripts/docs-capture/build.mjs
DOCS_CAPTURE_OUTPUT="$PWD/apps/docs/public/screenshots" node_modules/.bin/electron apps/sweetspot/out/docs-capture/main.js
```

The capture script produces full-page guide images and viewport previews, including all seven built-in player skins. Review the images before committing. Generated capture runtime files stay under the ignored app `out/` folder.

## Reusable skin screenshots

The supplied skin screenshots are saved in `public/screenshots/skins/originals/` with descriptive names for all seven skins. Background-removed PNGs in `public/screenshots/skins/` are used by the homepage and player guide. These have transparent exteriors, including the rounded window corners, so they can be reused on light and dark backgrounds.

Keep these assets separate from the automated captures above so running the capture script does not replace them. See `public/screenshots/skins/README.md` for reusable filenames. Editing prompts are kept locally in the Git-ignored `local/asset-prompts/` directory, outside public website assets.
