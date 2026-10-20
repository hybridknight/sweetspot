# Player skin implementation

Open **Player mode** from the icon in the main app toolbar. Choose Spotlight (the default), Studio, Aurora, Pop, Focus, Sleeve or Classic in **Settings → Player skins**. The expand icon returns to full mode with the same music, queue and EQ. Player mode has no native window bar; drag a skin module header to move it. The OS menu **Player → Player mode / Full mode** is always available as a fallback (Cmd/Ctrl+Shift+P / Cmd/Ctrl+Shift+F). Settings moves independently and keeps its position when reopened. Skins apply to player mode only.

The small settings icon in the player opens **Settings → Player skins**, where you can select and customize skins. Each control explains what it does. Changes preview immediately; **Apply** saves them for that skin, **Cancel** restores the saved version, and **Reset** previews its defaults. Showing or hiding the EQ panel does not enable or disable the equalizer. Focus, Sleeve, Aurora and Studio keep EQ folded by default; Classic places it directly below the transport panel and keeps video optional so its player, EQ and playlist remain together. Use the video panel icon to open it.

Video and artwork have their own panel, above the playlist in stacked skins and beside it in Studio and Spotlight. The window is a fixed player frame: playback controls stay visible, while the playlist scrolls inside its panel. Skins fill the window width and their panels meet edge to edge. EQ reserves its natural height without a scrollbar; the window minimum height adapts to visible controls. Video and playlist grow into the remaining height when resizing the window. Each panel has its own resize edge: dragging it adjusts that panel and changes the window height to preserve neighbouring panels while space allows. Opening video or expanding a panel is limited to the display’s usable height; the scrollable playlist gives up space first, and the window moves up if needed to keep its controls on screen. Focus an edge and use arrow keys, Home or End for keyboard resizing. Clicking the video uses the same persistent play/pause toggle as the player controls. Scrolling the playlist never moves the video or the playback controls. Queue selection preserves playlist context and distinguishes repeated songs. The Video tab asks YouTube Music to switch from song audio to its video counterpart when available.

Studio video follows the source aspect ratio at the full pane width, using the available screen height without cropping. Other video defaults follow the pane's 16:9 landscape size, up to the cap below. Minimums refer to the viewing area; tabs, padding and other panel controls are added separately. Very narrow panes scale the minimum down to their landscape size. Saved window sizes are retained, and a newly opened video panel uses its skin's default.

| Skin | Minimum viewing height | Default height cap | Video surround |
| --- | ---: | ---: | --- |
| Spotlight | 180 px | 420 px | Transparent artist backdrop |
| Studio | 180 px | Source video aspect ratio, within available screen height | Transparent, themed surrounding panel |
| Aurora | 160 px | 360 px | Transparent glass backdrop |
| Pop | 144 px | 280 px | Matching pale green surface |
| Focus | 144 px | 320 px | Dark matte |
| Sleeve | 144 px | 300 px | Matching paper surface |
| Classic | 112 px | 200 px | Dark inset matte |

The native video view is transparent outside the picture so it does not replace the skin's surround with a universal black rectangle. Fullscreen retains a black surround, and full mode restores YouTube Music's normal presentation.

Every skin supports rearranging the active play queue. Drag a song row to a new position; the insertion marker shows where it will land, and the list scrolls near its edges. Press Escape to cancel. Hover or focus a song to replace its duration with a “…” menu button. The menu offers Play now, Play next, Move up, Move down and Remove from queue. Focus a queue row and use Alt+Up/Down for keyboard reordering. Reordering keeps the current song playing and carries through to full mode and other skins. These controls change the active queue, without editing a saved library playlist.

The app does not offer skin package import or export. Users can customize the included skins and save their preferences. Existing saved custom skins remain readable for compatibility.

The package structure and examples below are internal development references. New shipped skins require an application code change. Schema serialization utilities remain available to repository tests; they are not exposed as app actions.

The [schema examples](examples) reflect the built-in skin data and are provided for repository development.

Classic’s instrument display includes a segmented SVG clock and a live 32-band SVG spectrum with falling peak markers. The bars read the existing local audio graph, including EQ changes; paused audio settles to zero. Remote casting and unavailable audio sources show no invented animation. Turn **Live spectrum** on or off in Appearance; any skin can expose the same boolean target. Sampling stops outside player mode and disconnects only the analysis branch when unused, preserving playback. The visualization also unsubscribes while paused or offscreen. Drawing is capped at 20 fps, uses one SVG path for the bars (plus Classic’s peak path), and skips unchanged geometry. Silent audio settles to an idle renderer; new audio samples restart it. Audio is sampled in its own renderer at 10 Hz and pushed through one shared, sender-checked stream; frames do not create command requests, response listeners, or debug logs. Identical audio frames are suppressed. The SVG has its own small paint/compositor layer so the glass panel does not redraw with each bar update.

## What's inside

| Section | What to change |
| --- | --- |
| `theme` | Six-digit hex colors, corner radius from 0–28 px, registered interface and heading fonts, and `flat`, `metal`, `paper`, `glass` or `pop` material. |
| `layout` | Preferred window width from 360–1000 px, `stack`, responsive `columns`, or split-pane `album`, and module order. Include `transport`, `media`, `queue` and `equalizer` exactly once. Media has its own full-width row in stack and columns layouts; album places it beside the playlist at widths of 720 px or more. Wide column skins place the open EQ beside the playlist below that row. |
| `artwork.panel` | An array of SVG shapes that scales behind each module. Coordinates use a 100 × 100 viewBox. |
| `artwork.button` | SVG artwork for transport buttons, also in a 100 × 100 viewBox. |
| `settings` | Your skin's own controls, grouped into `style` and `features`. Each needs a unique key and target, friendly label, description, type and default. |
| `guide` | Plain-text development metadata retained in the schema. |

SVG shapes are represented as data so the app can construct safe SVG elements. Supported shapes are `rect`, `circle` and `path`, with `fill`, optional `stroke`, `strokeWidth` and `opacity`. Use a hex color or `surface`, `text`, `accent`, `metal` or `none` for paint. `metal` uses the app's metallic gradient. Numeric coordinates are bounded. A panel stretches to fill its module; button artwork keeps its proportions.

For example, add this shape to `artwork.panel`:

```json
{
  "kind": "rect",
  "x": 1,
  "y": 1,
  "width": 98,
  "height": 98,
  "rx": 3,
  "fill": "surface",
  "stroke": "accent",
  "strokeWidth": 0.5
}
```

## Settings you can expose

| Target | Type | Supported values |
| --- | --- | --- |
| `accent` | `color` | `#RRGGBB` |
| `transparentBackground` | `boolean` | Native desktop translucency on macOS (glass skins); full mode stays opaque |
| `glassTone` | `select` | `plum`, `ocean`, `dusk` (glass material) |
| `glassOpacity`, `ambientGlow` | `range` | 0–100 percent; glass depth and SVG light intensity |
| `radius` | `range` | `min`, `max` and `default` within 0–28 |
| `finish` | `select` | `original`, `graphite`, `midnight` |
| `density` | `select` | `comfortable`, `compact` |
| `queueSide` | `select` | `left`, `right` (wide column layouts) |
| `coverShape` | `select` | `square`, `rounded`, `disc` |
| `spectrumEnabled` | `boolean` | Show app-owned SVG bars driven by local audio; Classic enables this by default |
| `showArtist`, `showDurations` | `boolean` | Show additional playlist information |
| `queueExpanded`, `eqExpanded`, `videoExpanded` | `boolean` | Show the corresponding panel or media view |

Select options have their own display labels. A default must be one of the option values. All controls include a description shown below the setting. You can leave out controls your skin doesn't need. Settings change presentation; they never change the actual EQ curve, volume, account, music or saved playlists. The native playlist and EQ toggles update the matching preference when the skin exposes one.

Every skin shares the real player controls, ten-band equalizer and video slot. Audio-only tracks fall back to album art. Full mode continues to handle music discovery and saved playlist editing. The current queue can be played, reordered and edited from player mode, with the same queue retained in full mode. Duplicate tracks have separate occurrence IDs, and stale queue selections are rejected.

## Safety and limits

Skin files contain data only. JavaScript, HTML, arbitrary CSS, raw SVG/XML, network assets, file paths, event handlers, foreign objects and unknown properties are rejected. Labels and notes render as plain text. The renderer builds SVG from validated shapes; it never inserts a skin's text as HTML. No archive extraction is involved.

The player renderer has Node integration disabled, context isolation and sandboxing enabled, a restrictive content policy and a restricted preload. The main process checks its allowed operations independently. Generic file access, application actions and settings writes are unavailable to the player; EQ access is limited to the existing validated EQ API. Skin selection, preferences, and the full-mode exit remain app-owned. This follows the boundaries described in [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security/).

Limits: 256 KB per file, 24 custom skins, 16 settings, 64 shapes per artwork array, 4,096 characters per path, 20 help notes, and bounded text/geometry. Use geometric artwork instead of embedded photos or fonts. Current skins support the documented layouts and settings targets; new behaviors require an app change.

## Developer checks

From the repository root:

```sh
pnpm test
pnpm typecheck
pnpm --filter sweetspot exec electron-vite build
pnpm --filter sweetspot test:player:ui
```

The desktop integration check uses an isolated temporary profile and local media/queue fixtures with a long playlist, recreated counterpart wrappers and nested hidden video containers. The fixtures run the actual queue navigation and video presentation helpers. It exercises the production renderer and sandbox preload, five built-ins, settings, compact layouts, queue occurrence selection, EQ writes, export/import, restricted settings access, video picture rendering, full-mode restoration, native menu switching, hidden native window buttons, and independent Settings movement. It does not use your account or app preferences. Live YouTube Music markup and account-specific video playback still need a signed-in manual check.

## Aurora / glass finish

Aurora is inspired by a frosted music-player reference, with its navigation sidebar omitted. It keeps the playlist header and artwork above the queue, and the live SVG audio timeline and transport at the bottom. Video opens in its own section above the playlist; EQ opens above the timeline. The audio timeline visualizes live frequency levels, and the playback-position slider seeks the actual song.

Customize Atmosphere, Glass depth, Ambient glow, Accent color, Corner softness, Playlist spacing and Album artwork shape in Appearance. The glass effect uses internal SVG lights and translucent panels; it does not capture the desktop. Export Aurora as a commented starter to develop your own glass skin. These effects are app-owned and use the same data-only validation as other skins.

Aurora's Desktop transparency switch enables the native macOS frosted background. Text, cover art and controls keep their own opacity; Glass depth changes the panel tint. Turning it off restores the solid background. Full mode and the other skins restore the ordinary window background. Only Classic has rounded outlines around entire modules; other skins use seamless panels, with corner controls applying to displays and playlist cards. Video opens at a 16:9 viewing height based on the pane width (capped at 360 px), including when reopening a saved window. The playlist takes the remaining height, and the video remains independently resizable.

Closing the video pane or choosing Artwork selects YouTube Music’s native Song mode. Returning to full mode keeps that audio selection. Audio tracks with a video counterpart can switch back to Video. Transparency clears html, body and the app root, as well as the native window and view backgrounds.

## Google Fonts and typography

Aurora pairs **Cinzel** for the main playlist heading with **Inter** for interface text, following the reference’s Cinzel/Inter pairing. Each skin uses a fixed pairing chosen for its design; Appearance does not offer font selection. **Manrope** is another bundled Google Fonts face available to skin authors.

In a skin file, set `theme.font` to `"google-inter"` and `theme.headingFont` to `"google-cinzel"`, for example. Omit `headingFont` to use the interface font for headings. Fonts belong to the skin theme, rather than customizable settings. Exported starters retain the chosen theme fonts and explanatory comments. Legacy font controls are removed when importing older packages.

Fonts load from app assets and work offline. A skin cannot supply a font URL, stylesheet, CSS font declaration or executable code. Adding another Google Font requires an app update to bundle its files, license and registry entry. Cinzel and Manrope come from the [official Google Fonts repository](https://github.com/google/fonts); Inter is bundled through Fontsource. Their SIL Open Font Licenses ship in `resources/licenses/google-fonts`.

## Adaptive video resolution

Skin video panes keep YouTube’s existing adaptive streaming player. The controller has a visible layout matching the display’s physical resolution (at least 1920 × 1080), while the video itself fits the actual pane. This prevents a compact pane from imposing a low-resolution size cap. YouTube Auto still adapts to connection speed, available source formats and codec support; an explicit preferred resolution remains respected. Closing video or returning to full mode removes this presentation geometry. No additional stream, forced resolution or playback restart is involved.

## Fullscreen video

Double-click a video in any skin to view it fullscreen. Press **Escape** or double-click the fullscreen video to return to the same player, window size and panel heights. Fullscreen keeps the existing media element, playback position, play/pause state, equalizer and adaptive quality. A single mouse click still toggles play/pause after a short wait to distinguish it from a double-click; keyboard and accessibility clicks remain immediate. The native Full mode menu remains available during fullscreen.

## Recommended type for each skin

| Skin | Interface | Main heading | Character |
| --- | --- | --- | --- |
| Focus | Inter | Manrope | Clear controls with a soft geometric heading |
| Classic | Tahoma (Arial fallback) | Tahoma | Compact desktop typography matching the retro player |
| Sleeve | Manrope | Cinzel | Clean playlist text with an album-cover serif heading |
| Aurora | Inter | Cinzel | The Cinzel/Inter pairing from its glass-player reference |

These pairings are applied automatically. Previously saved font overrides are retired; existing skins keep the fonts specified by their theme. Skin authors can choose another registered pairing by editing `theme.font` and `theme.headingFont` in an exported starter.

Classic uses pixel-sized beveled borders: softly rounded outside corners and tighter joins between adjacent modules. Its SVG finish no longer stretches a rounded frame with the panel height. Compact EQ faders show intermediate ticks, a stronger zero marker and inset numeric gain readouts. The Flat button resets all ten bands to 0 dB.

The player’s panel toggles remove the entire hidden slot and its grid row. Hiding the playlist compacts the window while preserving the other panels’ heights; showing it restores its last height. Panel size memories reset when changing skins.

Classic’s frame now follows the continuous/concentric corner principle described in [Apple’s corner guidance](https://developer.apple.com/documentation/swiftui/edge/corner/style/concentric): a 20 px outer curve, a 3 px inset, a 17 px inner curve and a 13 px inset header curve. Adjacent modules share straight seams. Electron renders these as app-owned CSS superellipse curves; older engines retain aligned rounded-corner fallbacks. This is an Apple-inspired approximation, not Apple’s native rendering code.

An opened panel always receives a usable minimum height, even if its first layout measurement is zero. Transport keeps its natural control height unless explicitly resized; extra minimum-window space goes to the video or playlist first. This avoids copying a collapsed playlist’s unused space into transport.

Routine desktop checks skip fullscreen. Run `node apps/sweetspot/scripts/check-player.cjs --fullscreen` only when a change needs fullscreen verification. The regular command still verifies player/full-mode transitions, panel layout, video panes and controls.


## Studio / album arrangement

Studio follows the supplied album-player reference: a dark record-sleeve stage on the left, a light lavender playlist on the right, large geometric headings, and a persistent bottom playback bar. Manrope is bundled offline for both display and interface text. The oversized artist name is actual track metadata; no genre, album title, year, or release information is invented.

Artwork is the initial view. The video/artwork switch in the playback bar replaces the record stage with the existing native video surface; playback uses the same session. EQ is collapsed by default and opens below the playlist, above transport. Below 720 px the panes stack. Closing the playlist expands artwork or video across the full player width, with EQ and playback controls below it. Double-click video to enter fullscreen; Escape or another double-click returns to the same pane. The album layout uses responsive pane sizing instead of independent drag resizing.

Buttons expose shuffle, repeat, video/artwork, EQ, queue, volume, previous/play/next, and seeking. The top bar exposes pin, skin settings, full mode, and minimize. Studio keyboard shortcuts: Space for play/pause, Alt+Left/Right for previous/next, Alt+E for EQ, Alt+V for video/artwork, and Alt+Q for the queue. Input fields retain their normal keyboard behavior; native video focus keeps its own controls. The same commands remain reachable as visible buttons.

Studio offers Original, Graphite, and Midnight finishes, accent colors, playlist density and detail controls. Its [schema example](examples/studio.sweetspotskin) documents the declarative album arrangement.

## Pop / pastel finish

Pop pairs an off-white canvas with bold ink outlines, a lilac transport bar, a yellow play button, pink queue selection, and an orange equalizer. It opens in Artwork mode; the Video tab uses the same native video surface and audio-only fallback as the other skins. Playback, seek, volume, shuffle, repeat, queue navigation, live spectrum, equalizer, panel resizing, pinning, and full-mode switching all use the shared player controls.

Select **Pop** under Appearance → Player skins. Customize the progress accent, playlist spacing, artist names, durations, spectrum, and visible panels. Exporting and importing preserves the `pop` material.

Pop reserves room for at least three queue rows by default, with a shorter artist header and waveform. Its video border follows the visible picture, including widescreen videos, rather than enclosing the empty letterbox margins. Its compact header uses artist artwork from the YouTube Music artist page, independently of the song artwork in the media pane. Requests use the existing YouTube Music session and cache per artist. Missing or failed artist images show a person icon; song covers are never substituted.


## Spotlight / artist backdrop

Spotlight follows the artist-led reference: full-window artist photography fades into charcoal, with a scrollable playlist on the left and song artwork plus playback controls on the right. The backdrop uses the artist-artwork service; it never substitutes a song cover. Missing artist images show a quiet gradient. Headings use bundled Manrope, with Inter for interface text.

Select **Spotlight** under Appearance → Player skins. Artwork is the initial view; the video/artwork switch in the playback bar replaces the right-hand song cover with the existing native player. EQ opens below both columns. Narrow windows stack media, controls, playlist and EQ. The playlist has its own scrollbar and keyboard navigation. Accent, density, artist names, durations and panel visibility can be customized. Export/import preserves the `spotlight` arrangement. It shares Studio’s playback and panel keyboard shortcuts.
