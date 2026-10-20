import { useId, type CSSProperties } from "react";
import type { SkinPackage, SkinValues } from "@shared/skins/schema";
import { skinPresentation } from "@shared/skins/presentation";
import { skinFontCss } from "@shared/skins/fonts";

/** Static sample of Pop's shared player modules, including feature preferences. */
export function PopPreview({ skin, values }: { skin: SkinPackage; values: SkinValues }) {
  const id = useId().replace(/:/g, "");
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const media = targets.videoExpanded !== false;
  const queue = targets.queueExpanded !== false;
  const eq = targets.eqExpanded !== false;
  const queueY = media ? 360 : 206;
  const eqY = queue ? queueY + 130 : queueY;
  return (
    <svg
      className="skin-preview"
      viewBox={`0 0 320 ${eqY + (eq ? 86 : 6)}`}
      role="img"
      aria-label={`${skin.name} sample player preview`}
      style={
        {
          ...skinPresentation(skin, values),
          "--skin-font": skinFontCss(skin.theme.font),
          "--skin-heading-font": skinFontCss(skin.theme.headingFont ?? skin.theme.font),
        } as CSSProperties
      }
    >
      <defs>
        <clipPath id={id}>
          <rect x="83" y="170" width="154" height="112" rx="12" />
        </clipPath>
      </defs>
      <rect width="320" height="520" fill="var(--skin-surface)" />
      <g data-module="transport" fill="var(--skin-text)">
        <text x="14" y="17" fontSize="8" fontWeight="800">
          POP · PLAYER
        </text>
        <text x="302" y="17" textAnchor="end" fontSize="9">
          ↗ · −
        </text>
        <rect
          x="14"
          y="27"
          width="290"
          height="105"
          rx="12"
          fill="#44344f"
          stroke="#071509"
          strokeWidth="2"
        />
        <circle cx="247" cy="62" r="22" fill="#9276a4" />
        <path d="M204 131 C204 70 290 70 290 131 Z" fill="#6c527f" />
        <text
          className="preview-track-heading"
          x="27"
          y="89"
          fill="white"
          fontSize="20"
          fontWeight="800"
        >
          Midnight Drive
        </text>
        <text x="27" y="105" fill="#f1eaf8" fontSize="10">
          Sample artist
        </text>
        {targets.spectrumEnabled === true && (
          <path
            d="M27 119 l8 -2 8 4 8 -7 8 9 8 -12 8 15 8 -10 8 6 8 -4 8 1 h150"
            stroke="#f5ff65"
            fill="none"
            strokeWidth="2"
          />
        )}
        <g transform="translate(0 64)">
          <path d="M18 74 H302" stroke="#bac3be" strokeWidth="2" />
          <path d="M18 74 H134" stroke="var(--skin-accent)" strokeWidth="3" />
          <circle cx="134" cy="74" r="3" fill="white" stroke="#071509" />
          <rect x="15" y="87" width="292" height="40" rx="20" fill="#071509" />
          <rect
            x="12"
            y="84"
            width="292"
            height="40"
            rx="20"
            fill="#c39bfa"
            stroke="#071509"
            strokeWidth="2"
          />
          <circle cx="86" cy="104" r="24" fill="#f5ff65" stroke="#071509" strokeWidth="2.5" />
          <path
            d="M82 96 V112 M90 96 V112"
            stroke="#071509"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M47 98 l-9 6 9 6 Z M125 98 l9 6 -9 6 Z" fill="#071509" />
          <path d="M177 104 H281" stroke="#071509" strokeWidth="2" />
          <circle cx="250" cy="104" r="4" fill="var(--skin-accent)" stroke="#071509" />
        </g>
      </g>
      {media && (
        <g data-module="media" transform="translate(0 64)">
          <text x="14" y="148" fontSize="8" fill="var(--skin-muted)">
            NOW PLAYING
          </text>
          <rect x="206" y="134" width="49" height="20" rx="10" fill="#c39bfa" stroke="#071509" />
          <text x="230" y="147" textAnchor="middle" fontSize="7" fill="#071509">
            Artwork
          </text>
          <text x="282" y="147" textAnchor="middle" fontSize="7" fill="#071509">
            Video
          </text>
          <rect x="17" y="166" width="289" height="122" rx="14" fill="#071509" />
          <rect
            x="14"
            y="163"
            width="289"
            height="122"
            rx="14"
            fill="#e7eee8"
            stroke="#071509"
            strokeWidth="2"
          />
          <g clipPath={`url(#${id})`}>
            <rect x="83" y="170" width="154" height="112" fill="#d4acd3" />
            <circle cx="214" cy="187" r="37" fill="#f5ff65" />
            <path d="M80 254 L122 180 L159 285 M161 285 L207 221 L253 285" fill="#00b7df" />
            <path d="M140 182 V258 M155 178 V254 M170 174 V250" stroke="#f5f9f8" strokeWidth="5" />
          </g>
        </g>
      )}
      {queue && (
        <g data-module="queue" transform={`translate(0 ${queueY})`}>
          <text x="14" y="12" fontSize="9" fontWeight="800" fill="#071509">
            UP NEXT
          </text>
          {["Midnight Drive", "Golden Hour", "After the Rain"].map((title, i) => (
            <g key={title} transform={`translate(14 ${22 + i * 34})`}>
              <rect
                width="290"
                height="31"
                rx={i ? 0 : 10}
                fill={i ? "transparent" : "#f6b0eb"}
                stroke={i ? "none" : "#071509"}
                strokeWidth="1.5"
              />
              <text x="10" y="17" fontSize="9" fill="#071509">
                {i + 1}
              </text>
              <text x="30" y="13" fontSize="10" fontWeight="800" fill="#071509">
                {title}
              </text>
              {targets.showArtist !== false && (
                <text x="30" y="25" fontSize="7" fill="var(--skin-muted)">
                  Sample artist
                </text>
              )}
              {targets.showDurations !== false && (
                <text x="278" y="18" textAnchor="end" fontSize="8" fill="#071509">
                  3:24
                </text>
              )}
            </g>
          ))}
        </g>
      )}
      {eq && (
        <g data-module="equalizer" transform={`translate(0 ${eqY})`}>
          <rect
            x="12"
            y="3"
            width="292"
            height="78"
            rx="14"
            fill="#ff956f"
            stroke="#071509"
            strokeWidth="2"
          />
          <text x="24" y="22" fontSize="9" fontWeight="800" fill="#071509">
            EQUALIZER
          </text>
          {Array.from({ length: 10 }, (_, i) => (
            <g key={i}>
              <path d={`M${30 + i * 28} 34 V68`} stroke="#071509" />
              <rect
                x={26 + i * 28}
                y={44 + (i % 3) * 4}
                width="8"
                height="5"
                rx="2"
                fill="#f5ff65"
                stroke="#071509"
              />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
