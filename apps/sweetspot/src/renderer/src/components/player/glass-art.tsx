import { useId } from "react";

/** Trusted SVG lights: skin files select a palette and intensity, never markup or filters. */
export function GlassBackdrop({
  tone = "plum",
  glow = 70,
  transparent = false,
}: {
  tone?: string;
  glow?: number;
  transparent?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const colors =
    tone === "ocean"
      ? ["#226b72", "#456fa6"]
      : tone === "dusk"
        ? ["#945c49", "#6561a2"]
        : ["#883b67", "#506f9f"];
  return (
    <svg
      className="glass-backdrop"
      viewBox="0 0 600 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        {colors.map((color, i) => (
          <radialGradient id={`${id}-${i}`} key={color}>
            <stop stopColor={color} />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <rect width="600" height="900" fill="#111627" opacity={transparent ? 0.2 : 1} />
      <g opacity={Math.max(0, Math.min(1, glow / 100))}>
        <ellipse cx="30" cy="200" rx="530" ry="460" fill={`url(#${id}-0)`} />
        <ellipse cx="600" cy="680" rx="560" ry="520" fill={`url(#${id}-1)`} />
      </g>
    </svg>
  );
}

export function GlassCover() {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="glass-cover-art">
      <defs>
        <linearGradient id={id} x2="1" y2="1">
          <stop stopColor="#181e39" />
          <stop offset="1" stopColor="#684665" />
        </linearGradient>
        <linearGradient id={`${id}-ribbon`} x2="0" y2="1">
          <stop stopColor="#f0f2ff" />
          <stop offset=".5" stopColor="#8095b2" />
          <stop offset="1" stopColor="#252b45" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#${id})`} />
      {[0, 15, 30].map((y) => (
        <path
          key={y}
          transform={`translate(0 ${y})`}
          d="M-10 47 C20 5 34 91 61 53 S92 22 111 30 L111 46 C87 38 86 37 65 69 S28 37 -10 63Z"
          fill={`url(#${id}-ribbon)`}
          stroke="#e0e5f4"
          strokeWidth=".5"
        />
      ))}
    </svg>
  );
}
