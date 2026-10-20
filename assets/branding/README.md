# Sweet Spot visual identity

Selected identity: **F / Quiet Aperture + Parkinsans SemiBold 600**.

The symbol uses two offset lobes around a transparent central aperture, representing the ideal listening position. The upright Parkinsans wordmark gives Sweet Spot distinctive letter shapes and a crisp, warm character.

## Masters

- `app-icon.svg`: warm-white symbol on a crimson tile, without text.
- `mark.svg` and `mark-mono.svg`: transparent symbol and black tray-template master.
- `wordmark-light.svg` and `wordmark-dark.svg`: standalone wordmarks for the named backgrounds.
- `wordmark-on-light.svg` and `wordmark-on-dark.svg`: horizontal symbol/name lockups.
- `hi-fi-art.svg`: flat, oversized aperture artwork for the website.
- `social-card.svg`: tagline and descriptor with the outlined wordmark.
- `identity.json`: selected typography, palette, and official copy.
- `brand-preview.png`: contact sheet of the actual production exports.

Primary tagline: **Your music. Just right.**

Descriptor: **Desktop Player for YouTube Music**.

Palette: **Crimson & Ink** — ink `#242121`, warm white `#FFF7F0`, crimson `#B52C39`, warm gray `#B2A39B`, surface `#393331`.

Crimson gives the identity a red connection to YouTube, while the aperture symbol and Parkinsans wordmark keep Sweet Spot recognizable on their own. Ink and warm white carry readable text. The app tile uses a white symbol on crimson. Primary buttons use crimson `#B52C39` with warm-white text in both appearances. Dark backgrounds use warm-white supporting text and focus rings. This preserves text contrast in both appearances.

## Typography and licensing

The logo uses [Parkinsans](https://fonts.google.com/specimen/Parkinsans) at weight **600**, upright, with native font spacing. Wordmarks are filled SVG outlines and require no installed font or network request. The original Google Fonts variable font, metadata, and SIL Open Font License are included in `fonts/parkinsans`. Supporting interface text retains its existing readable fonts.

## Regeneration

Run `pnpm brand:build` from the repository root. This updates renderer and docs logos and wordmarks, 16–1024 px PNG icons, Windows ICOs, macOS ICNS files, tray templates, website artwork, social cards, and the README banner. Generation uses the saved vector masters and does not depend on macOS, Swift, or online font downloads.

The tray template preserves the aperture mask and has no tile. Electron marks it as a template for light/dark menu bars.

Only the selected production identity and its required font source/license are retained here.
