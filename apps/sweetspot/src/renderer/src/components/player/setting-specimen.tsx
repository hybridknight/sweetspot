import type { CSSProperties } from "react";
import type { SkinPackage, SkinValues } from "@shared/skins/schema";
import { skinPresentation } from "@shared/skins/presentation";

/** Small, silent comparisons: no playback, remote artwork, or skin-provided markup. */
export function SettingSpecimen({
  skin,
  values,
  target,
  value,
}: {
  skin: SkinPackage;
  values: SkinValues;
  target: string;
  value: string | number;
}) {
  const setting = skin.settings.find((s) => s.target === target);
  const palette = skinPresentation(skin, {
    ...values,
    ...(setting ? { [setting.key]: value } : {}),
  });
  const radius = target === "radius" ? Number(value) : 14;
  const tone = value === "ocean" ? "#538ca2" : value === "dusk" ? "#c48a77" : "#a07da6";
  return (
    <svg
      className="setting-specimen"
      viewBox="0 0 120 64"
      aria-hidden="true"
      style={palette as CSSProperties}
    >
      <rect
        x="1"
        y="1"
        width="118"
        height="62"
        rx={radius}
        fill="var(--skin-surface)"
        stroke="var(--skin-border)"
      />
      {target === "coverShape" ? (
        <>
          <rect
            x="38"
            y="10"
            width="44"
            height="44"
            rx={value === "disc" ? 22 : value === "rounded" ? 10 : 0}
            fill="var(--skin-accent)"
          />
          <circle cx="60" cy="32" r="10" fill="var(--skin-surface)" opacity=".4" />
          <circle cx="60" cy="32" r="3" fill="var(--skin-surface)" />
        </>
      ) : target === "queueSide" ? (
        <>
          <rect
            x={value === "left" ? 62 : 9}
            y="9"
            width="49"
            height="46"
            rx="6"
            fill="var(--skin-accent)"
            opacity=".3"
          />
          {[18, 30, 42].map((y) => (
            <path
              key={y}
              d={`M${value === "left" ? 12 : 68} ${y} h36`}
              stroke="var(--skin-text)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          ))}
        </>
      ) : (
        <>
          {target === "glassTone" && (
            <rect x="8" y="8" width="104" height="48" rx="8" fill={tone} opacity=".6" />
          )}
          <rect
            x="9"
            y="9"
            width="30"
            height="46"
            rx={Math.max(0, radius - 8)}
            fill="var(--skin-accent)"
            opacity=".22"
          />
          {(target === "density" && value === "compact" ? [16, 24, 32, 40, 48] : [18, 32, 46]).map(
            (y, i) => (
              <path
                key={y}
                d={`M49 ${y} h${i === 0 ? 52 : 40}`}
                stroke={i === 0 ? "var(--skin-text)" : "var(--skin-muted)"}
                strokeWidth="3"
                strokeLinecap="round"
              />
            ),
          )}
        </>
      )}
    </svg>
  );
}
