import { useId } from "react";
import type { SkinPackage } from "@shared/skins/schema";
/** Rebuild validated shapes as React SVG. Skin text is never inserted as markup. */
export function VectorShapes({ skin, kind }: { skin: SkinPackage; kind: "panel" | "button" }) {
  const id = useId().replace(/:/g, "");
  function paint(value: string | undefined) {
    return value === "metal"
      ? `url(#${id})`
      : value === "surface"
        ? "var(--skin-surface)"
        : value === "accent"
          ? "var(--skin-accent)"
          : value === "text"
            ? "var(--skin-text)"
            : value;
  }
  return (
    <>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--skin-metal-top)" />
          <stop offset=".4" stopColor="var(--skin-metal-middle)" />
          <stop offset="1" stopColor="var(--skin-metal-bottom)" />
        </linearGradient>
      </defs>
      {skin.artwork[kind].map((shape, i) => {
        const { kind: type, fill, stroke, ...geometry } = shape;
        const props = { ...geometry, fill: paint(fill), stroke: paint(stroke) };
        return type === "rect" ? (
          <rect key={i} {...props} />
        ) : type === "circle" ? (
          <circle key={i} {...props} />
        ) : (
          <path key={i} {...props} />
        );
      })}
    </>
  );
}

export function VectorArt({ skin, kind }: { skin: SkinPackage; kind: "panel" | "button" }) {
  return (
    <svg
      className={`skin-vector skin-vector-${kind}`}
      viewBox="0 0 100 100"
      preserveAspectRatio={kind === "panel" ? "none" : "xMidYMid meet"}
      aria-hidden="true"
    >
      <VectorShapes skin={skin} kind={kind} />
    </svg>
  );
}
