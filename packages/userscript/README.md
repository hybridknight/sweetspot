# sweetspot-userscript

Tampermonkey / Violentmonkey userscript that opens convertible YouTube Music, YouTube, and youtu.be URLs in **Sweet Spot** via the `ssytm://` protocol.

## Behavior

- **Page load / SPA navigate** — if that host’s setting is on and the URL is actionable (watch, playlist, channel, shorts, embed, `@handle`), soft-opens matching `ssytm://` (browser tab stays).
- **No click interception** — normal link clicks stay in the browser.
- **Tampermonkey menu** — per-host toggles + open now:

| Setting | Default |
| --- | --- |
| `music.youtube.com` | ON |
| `youtube.com` | OFF |
| `m.youtube.com` | OFF |
| `youtu.be` | OFF |
| **Open this page now** | always available (ignores toggles) |

Home, search, and other non-actionable paths are ignored.

Requires Sweet Spot installed (or protocol registered) so the OS handles `ssytm://`.

## Develop

```bash
pnpm --filter sweetspot-userscript dev
# or from repo root:
pnpm userscript:dev
```

## Build

```bash
pnpm --filter sweetspot-userscript build
# or:
pnpm userscript:build
```

Output: `dist/sweetspot-userscript.user.js`

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Open `dist/sweetspot-userscript.user.js` in the browser (or paste into a new script).
3. Confirm install. Script matches music.youtube.com, youtube.com, m.youtube.com, and youtu.be.

See also: [docs — Browser userscript](../../apps/docs/content/docs/features/userscript.mdx) (site path `/docs/features/userscript`).
