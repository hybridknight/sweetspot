import { SpotlightPreview } from "./spotlight-preview";
import { PopPreview } from "./pop-preview";
import { StudioPreview } from "./studio-preview";
import { skinPresentation } from "@shared/skins/presentation";
import { skinFontCss } from "@shared/skins/fonts";
import { GlassBackdrop, GlassCover } from "./glass-art";
import { useId, type CSSProperties } from "react";
import { type SkinPackage, type SkinValues } from "@shared/skins/schema";
import { VectorShapes } from "./vector-art";

/** App-owned sample content. Imported skins supply only validated colors and SVG geometry. */
export function SkinPreview({ skin, values }: { skin: SkinPackage; values: SkinValues }) {
  const id = useId().replace(/:/g, "");
  if (skin.layout.arrangement === "spotlight")
    return <SpotlightPreview skin={skin} values={values} />;
  if (skin.theme.finish === "pop") return <PopPreview skin={skin} values={values} />;
  if (skin.layout.arrangement === "album") return <StudioPreview skin={skin} values={values} />;
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const glass = skin.theme.finish === "glass";
  const metal = skin.theme.finish === "metal";
  const palette = skinPresentation(skin, values);
  const accent = palette["--skin-accent"];
  const radius = Number(targets.radius ?? skin.theme.radius);
  const modules = skin.layout.modules.filter(
    (m) =>
      m === "transport" ||
      targets[m === "media" ? "videoExpanded" : m === "queue" ? "queueExpanded" : "eqExpanded"] !==
        false,
  );
  // Classic pins the equalizer beneath transport, just like the full skin renderer.
  if (metal && modules.includes("equalizer")) {
    modules.splice(modules.indexOf("equalizer"), 1);
    modules.splice(modules.indexOf("transport") + 1, 0, "equalizer");
  }
  const heights = { transport: 104, equalizer: 82, media: 116, queue: glass ? 260 : 112 };
  const columns = skin.layout.arrangement === "columns" && !metal;
  let y = 0;
  const boxes = modules.map((module) => {
    const pair =
      columns &&
      modules.includes("equalizer") &&
      modules.includes("queue") &&
      (module === "equalizer" || module === "queue");
    const box = {
      module,
      x: pair && (module === "queue") !== (targets.queueSide === "left") ? 162 : 0,
      y,
      w: pair ? 158 : 320,
      h: pair ? 112 : heights[module],
    };
    if (!pair || module === "queue") y += box.h + 3;
    return box;
  });
  // Pair the EQ and playlist at the bottom in the wide layout.
  if (columns && modules.includes("equalizer") && modules.includes("queue")) {
    let top = 0;
    for (const b of boxes.filter((b) => b.module !== "equalizer" && b.module !== "queue")) {
      b.y = top;
      top += b.h + 3;
    }
    for (const b of boxes.filter((b) => b.module === "equalizer" || b.module === "queue"))
      b.y = top;
    y = top + 115;
  }
  const text = "var(--skin-text)",
    muted = "var(--skin-muted)";
  return (
    <svg
      className="skin-preview"
      data-material={skin.theme.finish}
      data-finish={targets.finish ?? "original"}
      data-font={targets.font ?? skin.theme.font}
      viewBox={`-6 -6 332 ${y + 9}`}
      role="img"
      aria-label={`${skin.name} sample player preview`}
      style={
        {
          ...palette,
          "--skin-font": skinFontCss(targets.font ?? skin.theme.font),
          "--skin-heading-font": skinFontCss(
            targets.headingFont ?? skin.theme.headingFont ?? targets.font ?? skin.theme.font,
          ),
          "--glass-depth": String(0.12 + Number(targets.glassOpacity ?? 45) * 0.006),
          "--skin-accent": accent,
        } as CSSProperties
      }
    >
      <defs>
        <clipPath id={`${id}-shell`}>
          <rect width="320" height={y - 3} rx={metal ? 17 : 0} />
        </clipPath>
        <linearGradient id={id} x2="0" y2="1">
          <stop stopColor="var(--skin-metal-top)" />
          <stop offset="1" stopColor="var(--skin-metal-bottom)" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-shell)`}>
        {glass && <rect width="320" height={y - 3} fill="#111627" />}
        {glass && (
          <svg x="-6" y="-6" width="332" height={y + 9}>
            <GlassBackdrop
              tone={String(targets.glassTone ?? "plum")}
              glow={Number(targets.ambientGlow ?? 70)}
              transparent={targets.transparentBackground !== false}
            />
          </svg>
        )}
        {boxes.map(({ module, x, y: top, w, h }) => (
          <g key={module} data-module={module} transform={`translate(${x} ${top})`}>
            <rect
              width={w}
              height={h}
              rx={metal ? radius : 0}
              fill={
                metal
                  ? `url(#${id})`
                  : glass
                    ? "rgb(18 24 43 / var(--glass-depth))"
                    : "var(--skin-surface)"
              }
              stroke={metal ? "var(--skin-border)" : "none"}
            />
            <g transform={`scale(${w / 100} ${h / 100})`}>
              <VectorShapes skin={skin} kind="panel" />
            </g>
            <text x="10" y="14" fill={text} fontSize="8" letterSpacing="1">
              {module === "transport"
                ? skin.name.toUpperCase() + " · PLAYER"
                : module === "queue"
                  ? "PLAYLIST"
                  : module === "media"
                    ? "ALBUM ARTWORK"
                    : "EQUALIZER"}
            </text>
            {module === "transport" && !glass && (
              <>
                <rect
                  x="7"
                  y="22"
                  width={w - 14}
                  height="44"
                  rx={metal ? 4 : radius}
                  fill={metal ? "#152c42" : "var(--skin-border)"}
                />
                <text
                  x="16"
                  y="43"
                  fill={metal ? "#bad4ef" : text}
                  fontSize="20"
                  fontFamily="monospace"
                >
                  1:42
                </text>
                <text
                  className="preview-track-heading"
                  x="16"
                  y="58"
                  fill={metal ? "#bad4ef" : text}
                  fontSize="9"
                >
                  Midnight Drive · Sample artist
                </text>
                {targets.spectrumEnabled === true &&
                  Array.from({ length: 24 }, (_, i) => (
                    <rect
                      key={i}
                      x={202 + i * 4}
                      y={54 - (8 + ((i * 7) % 21))}
                      width="2"
                      height={8 + ((i * 7) % 21)}
                      fill={accent}
                    />
                  ))}
                <path d="M12 74 H308" stroke={muted} strokeWidth="2" />
                <path d="M12 74 H130" stroke={accent} strokeWidth="3" />
                {[24, 52, 80].map((cx, i) => (
                  <g key={cx}>
                    <circle cx={cx} cy="89" r="10" fill="var(--skin-surface)" stroke={muted} />
                    {i === 1 ? (
                      <path d={`M${cx - 2} 85 v8 M${cx + 2} 85 v8`} stroke={text} strokeWidth="2" />
                    ) : (
                      <path d={`M${cx - 3} 85 l6 4 -6 4 Z`} fill={text} />
                    )}
                  </g>
                ))}
                <path d="M115 89 H286" stroke={muted} strokeWidth="2" />
                <circle cx="230" cy="89" r="3" fill={accent} />
              </>
            )}
            {module === "transport" && glass && (
              <>
                {targets.spectrumEnabled === true &&
                  Array.from({ length: 48 }, (_, i) => {
                    const h = 6 + ((i * 13) % 34);
                    return (
                      <rect
                        key={i}
                        x={12 + i * 6.2}
                        y={43 - h / 2}
                        width="2"
                        height={h}
                        fill={accent}
                      />
                    );
                  })}
                <path d="M12 72 H308" stroke={muted} />
                <path d="M12 72 H140" stroke={accent} strokeWidth="2" />
                <text x="12" y="89" fill={muted} fontSize="8">
                  1:42
                </text>
                <circle cx="160" cy="88" r="9" fill={text} />
                <path d="M158 84 v8 M162 84 v8" stroke="var(--skin-surface)" strokeWidth="2" />
                <path d="M134 84 l-6 4 6 4 Z M186 84 l6 4 -6 4 Z" fill={text} />
                <path d="M238 88 H304" stroke={muted} />
                <circle cx="282" cy="88" r="2" fill={text} />
              </>
            )}
            {module === "queue" && glass && (
              <>
                <text x="12" y="36" fill={muted} fontSize="7" letterSpacing="1">
                  ACTIVE PLAYLIST · 4 TRACKS
                </text>
                <text className="preview-track-heading" x="12" y="59" fill={text} fontSize="18">
                  Midnight Drive
                </text>
                <text x="12" y="75" fill={muted} fontSize="10">
                  Sample artist
                </text>
                <defs>
                  <clipPath id={`${id}-header-cover`}>
                    {targets.coverShape === "disc" ? (
                      <circle cx="270" cy="67" r="36" />
                    ) : (
                      <rect
                        x="234"
                        y="31"
                        width="72"
                        height="72"
                        rx={targets.coverShape === "rounded" ? 8 : 0}
                      />
                    )}
                  </clipPath>
                </defs>
                <g clipPath={`url(#${id}-header-cover)`}>
                  <svg x="234" y="31" width="72" height="72">
                    <GlassCover />
                  </svg>
                </g>
              </>
            )}
            {module === "equalizer" && (
              <>
                <text x="10" y="29" fill={muted} fontSize="8">
                  ON · FLAT
                </text>
                {Array.from({ length: 10 }, (_, i) => {
                  const cx = 12 + (i * (w - 24)) / 9;
                  return (
                    <g key={i}>
                      <path d={`M${cx} 38 V${h - 12}`} stroke={muted} strokeWidth="2" />
                      <rect
                        x={cx - 4}
                        y={h / 2 + (i % 3) * 3}
                        width="8"
                        height="4"
                        rx="1"
                        fill={accent}
                      />
                    </g>
                  );
                })}
              </>
            )}
            {module === "media" && (
              <>
                <defs>
                  <clipPath id={`${id}-cover`}>
                    {targets.coverShape === "disc" ? (
                      <circle cx={w / 2} cy="66" r="42" />
                    ) : (
                      <rect
                        x={w / 2 - 42}
                        y="24"
                        width="84"
                        height="84"
                        rx={(targets.coverShape ?? "rounded") === "rounded" ? 12 : 0}
                      />
                    )}
                  </clipPath>
                </defs>
                <g
                  data-artwork-shape={targets.coverShape ?? "rounded"}
                  clipPath={`url(#${id}-cover)`}
                >
                  <rect x={w / 2 - 42} y="24" width="84" height="84" fill="var(--skin-border)" />
                  <circle cx={w / 2 + 14} cy="47" r="24" fill={accent} opacity=".65" />
                  <path
                    d={`M${w / 2 - 60} 108 l48 -70 66 70 Z`}
                    fill="var(--skin-surface)"
                    opacity=".7"
                  />
                  <path d={`M${w / 2 - 42} 108 l58 -36 26 36 Z`} fill={accent} opacity=".6" />
                </g>
              </>
            )}
            {module === "queue" && metal && (
              <rect x="7" y="18" width={w - 14} height={h - 25} fill="#152c42" />
            )}
            {module === "queue" &&
              ["Midnight Drive", "Golden Hour", "After the Rain", "Home Again"].map((title, i) => {
                const rowY =
                  (glass ? 131 : 24) +
                  i *
                    (glass
                      ? targets.density === "compact"
                        ? 23
                        : 29
                      : targets.density === "compact"
                        ? 17
                        : 21);
                return (
                  <g key={title}>
                    <rect
                      x="7"
                      y={rowY - 8}
                      width={w - 14}
                      height={
                        glass
                          ? targets.density === "compact"
                            ? 20
                            : 25
                          : targets.density === "compact"
                            ? 15
                            : 19
                      }
                      rx={metal ? 2 : Math.max(0, radius - 8)}
                      fill={i === 0 ? accent : "var(--skin-border)"}
                      opacity={i === 0 ? ".25" : ".15"}
                    />
                    <text x="12" y={rowY + 2} fill={metal ? "#eef1f7" : text} fontSize="8">
                      {title}
                    </text>
                    {targets.showArtist !== false && (
                      <text
                        data-preview-artist="true"
                        x="12"
                        y={rowY + 9}
                        fill={metal ? "#b1c4dd" : muted}
                        fontSize="5"
                      >
                        Sample artist
                      </text>
                    )}
                    {targets.showDurations !== false && (
                      <text
                        x={w - 12}
                        y={rowY + 2}
                        textAnchor="end"
                        fill={metal ? "#b1c4dd" : muted}
                        fontSize="7"
                      >
                        3:24
                      </text>
                    )}
                  </g>
                );
              })}
          </g>
        ))}
      </g>
    </svg>
  );
}
