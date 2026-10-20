import { SKIN_FONT_IDS } from "./fonts";
import { z } from "zod";

export const MAX_SKIN_BYTES = 256 * 1024;
export const skinId = z.string().regex(/^[a-z][a-z0-9-]{2,63}$/);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const label = z.string().trim().min(1).max(80);
const number = z.number().finite().min(-1000).max(1000);
const paint = z.union([color, z.enum(["none", "surface", "accent", "text", "metal"])]);
const common = {
  fill: paint,
  stroke: paint.optional(),
  strokeWidth: z.number().min(0).max(10).optional(),
  opacity: z.number().min(0).max(1).optional(),
};
// A deliberately small SVG vocabulary. No XML, URLs, CSS, text, filters, events or scripts.
export const shapeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("rect"),
      x: number,
      y: number,
      width: number.nonnegative(),
      height: number.nonnegative(),
      rx: number.nonnegative().optional(),
      ...common,
    })
    .strict(),
  z
    .object({
      kind: z.literal("circle"),
      cx: number,
      cy: number,
      r: number.nonnegative(),
      ...common,
    })
    .strict(),
  z
    .object({
      kind: z.literal("path"),
      d: z
        .string()
        .min(1)
        .max(4096)
        .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/),
      ...common,
    })
    .strict(),
]);
const vector = z.array(shapeSchema).max(64);
const target = z.enum([
  "font",
  "headingFont",
  "transparentBackground",
  "glassTone",
  "glassOpacity",
  "ambientGlow",
  "spectrumEnabled",
  "accent",
  "radius",
  "density",
  "showArtist",
  "showDurations",
  "queueExpanded",
  "eqExpanded",
  "videoExpanded",
  "queueSide",
  "coverShape",
  "finish",
]);
const settingBase = {
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/),
  label,
  description: z.string().max(240),
  group: z.enum(["style", "features"]),
  target,
};
export const skinSettingSchema = z.discriminatedUnion("type", [
  z.object({ ...settingBase, type: z.literal("boolean"), default: z.boolean() }).strict(),
  z.object({ ...settingBase, type: z.literal("color"), default: color }).strict(),
  z
    .object({
      ...settingBase,
      type: z.literal("range"),
      min: z.number().min(0).max(100),
      max: z.number().min(0).max(100),
      default: z.number().min(0).max(100),
    })
    .strict(),
  z
    .object({
      ...settingBase,
      type: z.literal("select"),
      options: z
        .array(z.object({ value: z.string().regex(/^[a-z-]{1,30}$/), label }).strict())
        .min(2)
        .max(8),
      default: z.string().max(30),
    })
    .strict(),
]);
export const skinPackageSchema = z
  .object({
    formatVersion: z.literal(1),
    id: skinId,
    name: label,
    author: label,
    description: z.string().max(400),
    // These notes travel with the skin. They are plain text and never evaluated.
    guide: z.array(z.string().max(1000)).max(20),
    theme: z
      .object({
        surface: color,
        text: color,
        muted: color,
        accent: color,
        border: color,
        radius: z.number().min(0).max(28),
        font: z.enum(SKIN_FONT_IDS),
        headingFont: z.enum(SKIN_FONT_IDS).optional(),
        finish: z.enum(["flat", "metal", "paper", "glass", "pop"]),
      })
      .strict(),
    layout: z
      .object({
        width: z.number().int().min(360).max(1000),
        arrangement: z.enum(["stack", "columns", "album", "spotlight"]),
        modules: z.array(z.enum(["media", "transport", "equalizer", "queue"])).length(4),
      })
      .strict(),
    artwork: z.object({ panel: vector, button: vector }).strict(),
    settings: z.array(skinSettingSchema).max(16),
  })
  .strict()
  .superRefine((skin, ctx) => {
    if (new Set(skin.layout.modules).size !== 4)
      ctx.addIssue({
        code: "custom",
        path: ["layout", "modules"],
        message: "Include each player module exactly once.",
      });
    const keys = new Set<string>(),
      targets = new Set<string>();
    for (const [i, setting] of skin.settings.entries()) {
      if (keys.has(setting.key) || targets.has(setting.target))
        ctx.addIssue({
          code: "custom",
          path: ["settings", i],
          message: "Setting keys and targets must be unique.",
        });
      keys.add(setting.key);
      targets.add(setting.target);
      if (
        setting.type === "range" &&
        (setting.min > setting.max ||
          setting.default < setting.min ||
          setting.default > setting.max)
      )
        ctx.addIssue({
          code: "custom",
          path: ["settings", i],
          message: "Default must be within the range.",
        });
      if (setting.type === "range" && setting.max > (setting.target === "radius" ? 28 : 100))
        ctx.addIssue({
          code: "custom",
          path: ["settings", i],
          message: "Range exceeds the supported limit for this target.",
        });
      if (
        setting.type === "select" &&
        (!setting.options.some((o) => o.value === setting.default) ||
          new Set(setting.options.map((o) => o.value)).size !== setting.options.length)
      )
        ctx.addIssue({
          code: "custom",
          path: ["settings", i],
          message: "Select a unique option as the default.",
        });
      const expected =
        setting.target === "accent"
          ? "color"
          : ["radius", "glassOpacity", "ambientGlow"].includes(setting.target)
            ? "range"
            : [
                  "font",
                  "headingFont",
                  "density",
                  "queueSide",
                  "coverShape",
                  "finish",
                  "glassTone",
                ].includes(setting.target)
              ? "select"
              : "boolean";
      if (setting.type !== expected)
        ctx.addIssue({
          code: "custom",
          path: ["settings", i],
          message: `This target needs a ${expected} setting.`,
        });
      if (setting.type === "select") {
        const allowed: Record<string, string[]> = {
          font: [...SKIN_FONT_IDS],
          headingFont: [...SKIN_FONT_IDS],
          glassTone: ["plum", "ocean", "dusk"],
          density: ["comfortable", "compact"],
          queueSide: ["left", "right"],
          coverShape: ["square", "rounded", "disc"],
          finish: ["original", "graphite", "midnight"],
        };
        if (setting.options.some((o) => !allowed[setting.target]?.includes(o.value)))
          ctx.addIssue({
            code: "custom",
            path: ["settings", i],
            message: "Unsupported style option.",
          });
      }
    }
  })
  // Older packages may expose font controls. Keep them importable, but typography
  // now belongs to the skin's theme; legacy controls and saved overrides retire.
  .transform((skin) => ({
    ...skin,
    settings: skin.settings.filter((s) => !["font", "headingFont"].includes(s.target)),
  }));
export type SkinPackage = z.infer<typeof skinPackageSchema>;
export type SkinSetting = z.infer<typeof skinSettingSchema>;
export type SkinValues = Record<string, string | number | boolean>;

export function settingDefaults(skin: SkinPackage): SkinValues {
  return Object.fromEntries(skin.settings.map((setting) => [setting.key, setting.default]));
}
export function validateSkinValues(skin: SkinPackage, raw: unknown): SkinValues {
  const values = raw && typeof raw === "object" ? (raw as SkinValues) : {};
  return Object.fromEntries(
    skin.settings.map((s) => {
      const v = values[s.key];
      const valid =
        s.type === "boolean"
          ? typeof v === "boolean"
          : s.type === "color"
            ? typeof v === "string" && color.safeParse(v).success
            : s.type === "range"
              ? typeof v === "number" && Number.isFinite(v) && v >= s.min && v <= s.max
              : s.options.some((o) => o.value === v);
      return [s.key, valid ? v : s.default];
    }),
  );
}

/** Remove JSONC comments without touching slashes or comment markers inside strings. */
export function parseSkin(text: string): SkinPackage {
  if (new TextEncoder().encode(text).length > MAX_SKIN_BYTES)
    throw new Error("Skin is too large. Maximum size is 256 KB.");
  let json = "",
    quoted = false,
    escape = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i],
      next = text[i + 1];
    if (quoted) {
      json += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') {
      quoted = true;
      json += c;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      json += "\n";
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      if (i >= text.length) throw new Error("Unclosed comment.");
      i++;
      json += " ";
      continue;
    }
    json += c;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error("This skin is not valid JSON. Check commas, quotes and comments in the file.");
  }
  const parsed = skinPackageSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`Invalid skin at ${issue.path.join(".") || "root"}: ${issue.message}`);
  }
  return parsed.data;
}
export function exportSkin(skin: SkinPackage, values: SkinValues): string {
  const copy = skinPackageSchema.parse({
    ...skin,
    id: skin.id.startsWith("builtin-") ? skin.id.replace("builtin-", "my-") : skin.id,
    name: skin.id.startsWith("builtin-") ? `My ${skin.name}` : skin.name,
    settings: skin.settings.map((s) => ({
      ...s,
      default: validateSkinValues(skin, values)[s.key],
    })),
  });
  const annotations: Record<string, string> = {
    theme:
      "Default palette. Use #RRGGBB; radius is 0–28 px; font/headingFont use registered font IDs: system, mono, classic, google-inter, google-cinzel, google-manrope. Google Fonts are bundled locally.",
    layout: "Player width (360–1000 px), stack or columns, and each module exactly once.",
    artwork:
      'SVG shape arrays in a 100 × 100 viewBox. Nothing here can load scripts or URLs.\n  // Example: { "kind": "rect", "x": 1, "y": 1, "width": 98, "height": 98, "rx": 3, "fill": "surface" }',
    settings:
      "Each entry becomes a setting in this skin. Label and description are shown to users.\n  // Keep target/type compatible. default sets the initial value; group is style or features.",
    guide: "Plain-text development notes. These notes also appear under Develop your own skin.",
  };
  const annotated = JSON.stringify(copy, null, 2)
    .split("\n")
    .map((line) => {
      const key = /^  \"(theme|layout|artwork|settings|guide)\":/.exec(line)?.[1];
      return key ? `  // ${annotations[key]}\n${line}` : line;
    })
    .join("\n");
  return `// Sweet Spot · skin development starter\n// Rename id and name before importing your own design. Save as UTF-8 .sweetspotskin.\n// This is JSON with comments: data only, no scripts, HTML, CSS or remote assets.\n// theme: colors, corners, font and finish. layout: width, arrangement, module order.\n// artwork: SVG primitives in a 100 × 100 viewBox. Allowed: rect, circle, path.\n// Paint: #RRGGBB, none, surface, text, accent, metal (app-owned gradient).\n// settings: labels + help text, safe targets, options and defaults.\n// Exported defaults reflect your current skin settings; no account or playback data.\n${annotated}\n`;
}
