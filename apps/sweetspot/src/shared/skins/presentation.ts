import type { SkinPackage, SkinValues } from "./schema";

/** One palette for the player and every settings specimen. Custom accents are preserved. */
export function skinPresentation(skin: SkinPackage, values: SkinValues) {
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const finish = targets.finish;
  const paper = skin.theme.finish === "paper";
  const palette =
    finish === "graphite"
      ? {
          surface: paper ? "#302b29" : "#262c34",
          text: "#f0efed",
          muted: "#bcb8b4",
          border: "#555453",
          accent: paper ? "#e4b58d" : "#c4d1df",
        }
      : finish === "midnight"
        ? {
            surface: paper ? "#211f24" : "#142236",
            text: "#edf0f8",
            muted: "#b4bdcf",
            border: "#414b60",
            accent: paper ? "#dcbfa8" : "#b8d3f2",
          }
        : skin.theme;
  const accent =
    !targets.accent || targets.accent === skin.theme.accent
      ? palette.accent
      : String(targets.accent);
  return {
    "--skin-surface": palette.surface,
    "--skin-text": palette.text,
    "--skin-muted": palette.muted,
    "--skin-border": palette.border,
    "--skin-accent": accent,
    "--skin-radius": `${targets.radius ?? skin.theme.radius}px`,
    "--skin-metal-top":
      finish === "graphite" ? "#758197" : finish === "midnight" ? "#425774" : "#fafbfe",
    "--skin-metal-middle":
      finish === "graphite" ? "#45556e" : finish === "midnight" ? "#243951" : "#e1e5ec",
    "--skin-metal-bottom":
      finish === "graphite" ? "#293951" : finish === "midnight" ? "#14253c" : "#a6afbf",
  };
}
