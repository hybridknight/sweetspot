import { useId, type CSSProperties } from "react";
import type { SkinPackage, SkinValues } from "@shared/skins/schema";
import { skinPresentation } from "@shared/skins/presentation";
import { skinFontCss } from "@shared/skins/fonts";
import { GlassCover } from "./glass-art";

/** A silent specimen of Studio's actual split-pane arrangement. */
export function StudioPreview({ skin, values }: { skin: SkinPackage; values: SkinValues }) {
  const id = useId().replace(/:/g, "");
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const media = targets.videoExpanded !== false,
    queue = targets.queueExpanded !== false,
    eq = targets.eqExpanded === true;
  const x = media && queue ? 160 : 0,
    width = media && queue ? 160 : 320;
  return (
    <svg
      className="skin-preview"
      viewBox="0 0 320 240"
      role="img"
      aria-label={`${skin.name} sample player preview`}
      style={
        {
          ...skinPresentation(skin, values),
          fontFamily: skinFontCss(skin.theme.font),
        } as CSSProperties
      }
    >
      <defs>
        <linearGradient id={id}>
          <stop stopColor="var(--skin-surface)" />
          <stop offset="1" stopColor="var(--skin-accent)" stopOpacity=".18" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill="var(--skin-surface)" />
      <text x="10" y="12" fontSize="6" fill="var(--skin-text)">
        STUDIO / LISTENING ROOM
      </text>
      <path d="M285 8 h6 m8 0 h6" stroke="var(--skin-muted)" />
      {media && (
        <g data-module="media">
          <rect
            y="20"
            width={queue ? 160 : 320}
            height={queue ? 150 : eq ? 118 : 168}
            fill="#202022"
          />
          <g transform={queue ? undefined : `translate(80 ${eq ? -8 : 0})`}>
            <circle cx="105" cy="94" r="49" fill="#f3f1f6" />
            <circle cx="105" cy="94" r="15" fill="var(--skin-accent)" />
            <circle cx="105" cy="94" r="3" fill="#252529" />
            <svg x="16" y="42" width="98" height="104">
              <GlassCover />
            </svg>
          </g>
          {queue && (
            <g>
              <text x="12" y="191" fontSize="5" letterSpacing="1" fill="var(--skin-muted)">
                ON THE RECORD
              </text>
              <text
                className="preview-track-heading"
                x="12"
                y="214"
                fontSize="20"
                fill="var(--skin-text)"
                letterSpacing="-1"
              >
                Sample artist
              </text>
            </g>
          )}
        </g>
      )}
      {queue && (
        <g data-module="queue">
          <rect x={x} y="20" width={width} height={eq ? 118 : 168} fill={`url(#${id})`} />
          <text x={x + 14} y="40" fontSize="5" letterSpacing=".5" fill="var(--skin-muted)">
            NOW PLAYING / 4 TRACKS
          </text>
          <text
            className="preview-track-heading"
            x={x + 14}
            y="63"
            fontSize="12"
            fontWeight="700"
            fill="var(--skin-text)"
          >
            MIDNIGHT DRIVE
          </text>
          {["Midnight Drive", "Golden Hour", "After the Rain", "Home Again"]
            .slice(0, eq ? 2 : 4)
            .map((title, i) => {
              const y = 84 + i * (targets.density === "compact" ? 19 : 25);
              return (
                <g key={title}>
                  <rect
                    x={x}
                    y={y - 6}
                    width={width}
                    height="23"
                    fill="var(--skin-surface)"
                    opacity={i === 0 ? 0.7 : 0.1}
                  />
                  <path d={`M${x + 10} ${y} l4 3 -4 3z`} fill="var(--skin-text)" />
                  <text x={x + 22} y={y + 4} fontSize="6" fill="var(--skin-text)">
                    {title}
                  </text>
                  {targets.showArtist !== false && (
                    <text
                      data-preview-artist="true"
                      x={x + 22}
                      y={y + 12}
                      fontSize="4"
                      fill="var(--skin-muted)"
                    >
                      Sample artist
                    </text>
                  )}
                  {targets.showDurations !== false && (
                    <text
                      x={x + width - 10}
                      y={y + 4}
                      fontSize="5"
                      textAnchor="end"
                      fill="var(--skin-muted)"
                    >
                      3:24
                    </text>
                  )}
                </g>
              );
            })}
        </g>
      )}
      {eq && (
        <g data-module="equalizer">
          <rect x={x} y="138" width={width} height="50" fill="var(--skin-surface)" />
          <text x={x + 10} y="148" fontSize="5" fill="var(--skin-muted)">
            EQUALIZER
          </text>
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i}>
              <path d={`M${x + 14 + (i * (width - 28)) / 9} 155 v23`} stroke="var(--skin-border)" />
              <circle
                cx={x + 14 + (i * (width - 28)) / 9}
                cy={164 + (i % 3) * 3}
                r="2"
                fill="var(--skin-accent)"
              />
            </g>
          ))}
        </g>
      )}
      <g data-module="transport">
        <path d={`M${x} 190 h${width}`} stroke="var(--skin-border)" />
        <path d={`M${x} 190 h${width * 0.43}`} stroke="var(--skin-accent)" strokeWidth="2" />
        <circle cx={x + width * 0.43} cy="190" r="2" fill="var(--skin-accent)" />
        <circle cx={x + 35} cy="210" r="9" fill="var(--skin-text)" />
        <path d={`M${x + 33} 206 v8 m4 -8 v8`} stroke="var(--skin-surface)" strokeWidth="2" />
        <path d={`M${x + 18} 206 l-5 4 5 4z M${x + 52} 206 l5 4 -5 4z`} fill="var(--skin-text)" />
        <path d={`M${x + 72} 210 h${width - 87}`} stroke="var(--skin-muted)" />
        <text x={x + 12} y="232" fontSize="5" fill="var(--skin-muted)">
          SHUFFLE · REPEAT
        </text>
        <text x={x + width - 12} y="232" textAnchor="end" fontSize="5" fill="var(--skin-muted)">
          VIDEO · EQ · QUEUE
        </text>
      </g>
    </svg>
  );
}
