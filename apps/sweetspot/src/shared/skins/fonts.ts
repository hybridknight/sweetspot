/** Font IDs are data, never URLs/CSS. Google Fonts are bundled by the app with their licenses. */
export const SKIN_FONT_IDS = [
  "system",
  "mono",
  "classic",
  "google-inter",
  "google-cinzel",
  "google-manrope",
] as const;
export type SkinFontId = (typeof SKIN_FONT_IDS)[number];
export const SKIN_FONTS = [
  {
    id: "system",
    label: "System",
    description: "Your device’s interface font",
    css: "system-ui, sans-serif",
  },
  {
    id: "mono",
    label: "Mono",
    description: "Evenly spaced, instrument-like text",
    css: "ui-monospace, monospace",
  },
  {
    id: "classic",
    label: "Tahoma",
    description: "Compact retro interface · Arial fallback",
    css: "Tahoma, Arial, sans-serif",
  },
  {
    id: "google-inter",
    label: "Inter",
    description: "Clear, neutral interface text",
    css: '"Inter Variable", system-ui, sans-serif',
  },
  {
    id: "google-cinzel",
    label: "Cinzel",
    description: "Roman-inspired serif for display headings",
    css: '"Cinzel Variable", Georgia, serif',
  },
  {
    id: "google-manrope",
    label: "Manrope",
    description: "Soft geometric sans for modern players",
    css: '"Manrope Variable", system-ui, sans-serif',
  },
] satisfies { id: SkinFontId; label: string; description: string; css: string }[];
export function skinFontCss(id: unknown): string {
  return SKIN_FONTS.find((font) => font.id === id)?.css ?? SKIN_FONTS[0].css;
}
