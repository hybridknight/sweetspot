import { skinPackageSchema, type SkinPackage, type SkinSetting } from "./schema";
const features: SkinSetting[] = [
  {
    key: "spectrumEnabled",
    target: "spectrumEnabled",
    type: "boolean",
    group: "features",
    label: "Live spectrum",
    description: "Follow the music with a live visualizer. Bars settle when paused.",
    default: false,
  },
  {
    key: "queueExpanded",
    target: "queueExpanded",
    type: "boolean",
    group: "features",
    label: "Show playlist",
    description: "Keep the playlist panel visible in the player.",
    default: true,
  },
  {
    key: "eqExpanded",
    target: "eqExpanded",
    type: "boolean",
    group: "features",
    label: "Show equalizer",
    description: "Show ten-band controls. Hiding this panel does not turn EQ off.",
    default: true,
  },
  {
    key: "videoExpanded",
    target: "videoExpanded",
    type: "boolean",
    group: "features",
    label: "Show video",
    description: "Show the current music video when available. Audio-only tracks show artwork.",
    default: true,
  },
  {
    key: "showArtist",
    target: "showArtist",
    type: "boolean",
    group: "features",
    label: "Artist names",
    description: "Include artist names in the playlist.",
    default: true,
  },
  {
    key: "showDurations",
    target: "showDurations",
    type: "boolean",
    group: "features",
    label: "Track durations",
    description: "Include each track's duration when YouTube Music provides it.",
    default: true,
  },
];
const style: SkinSetting[] = [
  {
    key: "finish",
    target: "finish",
    type: "select",
    group: "style",
    label: "Finish",
    description: "Coordinated surfaces, text and accents in three balanced finishes.",
    options: [
      { value: "original", label: "Original" },
      { value: "graphite", label: "Graphite" },
      { value: "midnight", label: "Midnight" },
    ],
    default: "original",
  },
  {
    key: "accent",
    target: "accent",
    type: "color",
    group: "style",
    label: "Accent color",
    description: "Color for progress, selection, and the equalizer curve.",
    default: "#b8c9e0",
  },
  {
    key: "density",
    target: "density",
    type: "select",
    group: "style",
    label: "Playlist spacing",
    description: "Compact fits more tracks; comfortable gives each row more room.",
    options: [
      { value: "comfortable", label: "Comfortable" },
      { value: "compact", label: "Compact" },
    ],
    default: "comfortable",
  },
];
const guide = [
  "Start by changing id, name, author and description. IDs use lowercase letters, digits and hyphens, and must be unique.",
  "theme defines the default palette. Color values must be six-digit hex. Choose a registered font ID for font and optional headingFont: system, mono, classic, google-inter, google-cinzel or google-manrope. The Google Fonts are bundled offline. Fonts belong to the theme, not user-selectable settings.",
  "layout.modules contains media, transport, equalizer and queue once each. Change their order; choose stack or columns, and a width from 360 to 1000.",
  "artwork.panel and artwork.button are SVG shapes in a 100 × 100 coordinate space. Use rect, circle or path; colors can refer to surface, text, accent or metal. These graphics scale with the player.",
  "settings creates this skin's own style and feature controls. Each control has a friendly label, description, group and a supported target. Targets attach to app-owned behavior; custom code is never loaded.",
  "For ranges, corner radius uses 0–28 px; glass depth and ambient glow use 0–100 percent. Select options must use the supported values shown in this starter. Boolean controls use true/false.",
  "Save your file, use Import skin in player settings, then select it. Re-import the same ID to update it. Your other skins and EQ settings stay separate.",
  "This file can contain // and /* */ comments. Do not add JavaScript, HTML, CSS, raw SVG, network URLs or file paths. Unknown properties are rejected.",
];
const base = {
  formatVersion: 1 as const,
  author: "Sweet Spot",
  guide,
  layout: {
    width: 620,
    arrangement: "stack" as const,
    modules: ["transport", "media", "queue", "equalizer"] as SkinPackage["layout"]["modules"],
  },
  artwork: { panel: [], button: [] },
};
export const BUILTIN_SKINS: SkinPackage[] = [
  skinPackageSchema.parse({
    ...base,
    id: "builtin-spotlight",
    name: "Spotlight",
    description:
      "A cinematic artist backdrop, a scrollable playlist and an intimate artwork or video stage.",
    layout: {
      width: 1000,
      arrangement: "spotlight",
      modules: ["queue", "media", "transport", "equalizer"],
    },
    theme: {
      surface: "#192020",
      text: "#ffffff",
      muted: "#c4cccc",
      accent: "#f3df36",
      border: "#536060",
      radius: 0,
      font: "google-inter",
      headingFont: "google-manrope",
      finish: "flat",
    },
    settings: [
      ...style
        .filter((s) => s.target !== "finish")
        .map((s) => (s.type === "color" ? { ...s, default: "#f3df36" } : s)),
      ...features
        .filter((s) => s.target !== "spectrumEnabled")
        .map((s) => (s.target === "eqExpanded" ? { ...s, default: false } : s)),
    ],
    guide: [
      ...guide,
      "The spotlight arrangement uses artist artwork as its backdrop, independently of the song cover or native video on the right. The playlist scrolls on the left; narrow windows stack the panels.",
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-studio",
    name: "Studio",
    description:
      "A record sleeve, oversized type and a lavender playlist. Made for listening to whole albums.",
    layout: {
      width: 960,
      arrangement: "album",
      modules: ["media", "queue", "equalizer", "transport"],
    },
    theme: {
      surface: "#f7f6f3",
      text: "#252529",
      muted: "#666571",
      accent: "#6554b8",
      border: "#d6d3dd",
      radius: 8,
      font: "google-manrope",
      headingFont: "google-manrope",
      finish: "flat",
    },
    settings: [
      ...style.map((s) => (s.type === "color" ? { ...s, default: "#6554b8" } : s)),
      ...features
        .filter((s) => s.target !== "spectrumEnabled")
        .map((s) =>
          s.target === "eqExpanded"
            ? {
                ...s,
                default: false,
                description:
                  "Open equalizer controls above the playback bar. Your sound stays the same when hidden.",
              }
            : s.target === "videoExpanded"
              ? {
                  ...s,
                  label: "Artwork & video pane",
                  description: "Keep the record sleeve visible. Switch to video in the same pane.",
                }
              : s,
        ),
    ],
    guide: [
      ...guide,
      "The album arrangement places artwork beside the playlist at desktop widths and stacks them in compact windows. EQ opens above the bottom transport bar. Manrope supplies both interface and display typography.",
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-aurora",
    name: "Aurora",
    description:
      "Frosted plum and midnight blue, an artwork header, floating track rows and a bottom audio timeline.",
    layout: {
      width: 560,
      arrangement: "stack",
      modules: ["media", "queue", "equalizer", "transport"],
    },
    theme: {
      surface: "#171e32",
      text: "#f4eff8",
      muted: "#b8b7ca",
      accent: "#ead5ef",
      border: "#626479",
      radius: 20,
      font: "google-inter",
      headingFont: "google-cinzel",
      finish: "glass",
    },
    settings: [
      ...style
        .filter((s) => s.target !== "finish")
        .map((s) => (s.type === "color" ? { ...s, default: "#ead5ef" } : s)),
      {
        key: "transparentBackground",
        target: "transparentBackground",
        type: "boolean",
        group: "style",
        label: "Desktop transparency",
        description:
          "Show the desktop through the frosted player on macOS. Turn off for an opaque background. Glass depth adjusts the tint; text and controls stay clear.",
        default: true,
      },
      {
        key: "glassTone",
        target: "glassTone",
        type: "select",
        group: "style",
        label: "Atmosphere",
        description: "Choose the colors of the soft lights behind the glass.",
        options: [
          { value: "plum", label: "Plum & blue" },
          { value: "ocean", label: "Ocean" },
          { value: "dusk", label: "Warm dusk" },
        ],
        default: "plum",
      },
      {
        key: "glassOpacity",
        target: "glassOpacity",
        type: "range",
        group: "style",
        label: "Glass depth",
        description:
          "Low values let the ambient lights show through; high values give the panels a darker, more solid finish.",
        min: 0,
        max: 100,
        default: 45,
      },
      {
        key: "ambientGlow",
        target: "ambientGlow",
        type: "range",
        group: "style",
        label: "Ambient glow",
        description:
          "Adjust the brightness of the background lights. Set to zero for a quiet dark surface.",
        min: 0,
        max: 100,
        default: 70,
      },
      {
        key: "radius",
        target: "radius",
        type: "range",
        group: "style",
        label: "Corner softness",
        description:
          "Soften playlist cards while keeping their inset corners balanced. 20 px is recommended.",
        min: 0,
        max: 28,
        default: 20,
      },
      {
        key: "coverShape",
        target: "coverShape",
        type: "select",
        group: "style",
        label: "Album artwork shape",
        description:
          "Shape of the header artwork and album art in the Artwork tab. Videos keep their original shape.",
        options: [
          { value: "square", label: "Square" },
          { value: "rounded", label: "Rounded" },
          { value: "disc", label: "Circle" },
        ],
        default: "rounded",
      },
      ...features.map((s) =>
        ["eqExpanded", "videoExpanded"].includes(s.target)
          ? { ...s, default: false }
          : s.target === "spectrumEnabled"
            ? { ...s, default: true }
            : s,
      ),
    ],
    guide: [
      ...guide,
      "The glass finish uses app-owned SVG ambient lights. glassTone selects a supported palette; glassOpacity and ambientGlow use 0–100 percentages. No desktop capture or skin code is used.",
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-pop",
    name: "Pop",
    description:
      "Bold ink outlines, pastel panels and a sunny yellow play button. A little more color for your everyday listening.",
    layout: { ...base.layout, width: 560 },
    theme: {
      surface: "#f5f9f8",
      text: "#071509",
      muted: "#526057",
      accent: "#00b7df",
      border: "#071509",
      radius: 22,
      font: "google-manrope",
      headingFont: "google-manrope",
      finish: "pop",
    },
    settings: [
      ...style
        .filter((s) => s.target !== "finish")
        .map((s) => (s.type === "color" ? { ...s, default: "#00b7df" } : s)),
      ...features.map((s) =>
        s.target === "spectrumEnabled"
          ? { ...s, key: "heroSpectrum", label: "Artist banner waveform", default: true }
          : s.target === "eqExpanded"
            ? { ...s, default: false }
            : s.target === "videoExpanded"
              ? {
                  ...s,
                  label: "Artwork & video pane",
                  description:
                    "Show the media pane. Choose artwork or the current music video inside it.",
                }
              : s,
      ),
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-focus",
    name: "Focus",
    description: "Quiet charcoal surfaces, precise controls and a clear queue.",
    theme: {
      surface: "#1a1d24",
      text: "#eef1f7",
      muted: "#a1a9b8",
      accent: "#b8c9e0",
      border: "#363d49",
      radius: 20,
      font: "google-inter",
      headingFont: "google-manrope",
      finish: "flat",
    },
    settings: [
      ...style,
      {
        key: "radius",
        target: "radius",
        type: "range",
        group: "style",
        label: "Corner softness",
        description: "Keep the display and inset playlist rows in harmony. 20 px is recommended.",
        min: 0,
        max: 28,
        default: 20,
      },
      ...features.map((s) => (s.target === "eqExpanded" ? { ...s, default: false } : s)),
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-sleeve",
    name: "Sleeve",
    description: "Warm paper, generous cover art and a record-sleeve playlist.",
    layout: { ...base.layout, width: 820, arrangement: "columns" },
    theme: {
      surface: "#eee4d7",
      text: "#42392f",
      muted: "#76695a",
      accent: "#a86e46",
      border: "#cdbca7",
      radius: 14,
      font: "google-manrope",
      headingFont: "google-cinzel",
      finish: "paper",
    },
    settings: [
      ...style.map((s) => (s.type === "color" ? { ...s, default: "#a86e46" } : s)),
      {
        key: "coverShape",
        target: "coverShape",
        type: "select",
        group: "style",
        label: "Album artwork shape",
        description:
          "Choose how album art is cropped in the Artwork tab. Videos keep their original shape. Switch to Artwork in the player to see this change.",
        options: [
          { value: "square", label: "Square" },
          { value: "rounded", label: "Rounded" },
          { value: "disc", label: "Circle" },
        ],
        default: "square",
      },
      {
        key: "queueSide",
        target: "queueSide",
        type: "select",
        group: "features",
        label: "Playlist side",
        description: "Place the playlist on either side of the open equalizer in wide windows.",
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
        default: "right",
      },
      ...features.map((s) => (s.target === "eqExpanded" ? { ...s, default: false } : s)),
    ],
  }),
  skinPackageSchema.parse({
    ...base,
    id: "builtin-classic",
    name: "Classic",
    description:
      "Modern-retro silver modules, an instrument display and a Winamp-inspired playlist.",
    layout: { ...base.layout, width: 460, modules: ["transport", "equalizer", "media", "queue"] },
    theme: {
      surface: "#dce0e8",
      text: "#2e3b50",
      muted: "#58657c",
      accent: "#bad4ef",
      border: "#748197",
      radius: 8,
      font: "classic",
      finish: "metal",
    },
    artwork: {
      panel: [
        {
          kind: "rect",
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rx: 0,
          fill: "metal",
          stroke: "none",
          strokeWidth: 0,
        },
        {
          kind: "path",
          d: "M 3 5 H 97 M 3 95 H 68 L 74 89 H 97",
          fill: "none",
          stroke: "#ffffff",
          strokeWidth: 1,
          opacity: 0.35,
        },
      ],
      button: [
        { kind: "circle", cx: 50, cy: 50, r: 47, fill: "metal", stroke: "#66758b", strokeWidth: 3 },
        {
          kind: "circle",
          cx: 50,
          cy: 48,
          r: 37,
          fill: "none",
          stroke: "#ffffff",
          strokeWidth: 2,
          opacity: 0.8,
        },
      ],
    },
    settings: [
      ...style.map((s) =>
        s.type === "color"
          ? { ...s, default: "#bad4ef" }
          : s.target === "density"
            ? { ...s, default: "compact" }
            : s,
      ),
      ...features.map((s) =>
        s.target === "videoExpanded"
          ? { ...s, default: false }
          : s.target === "spectrumEnabled"
            ? { ...s, default: true }
            : s,
      ),
    ],
  }),
];
export function resolveSkin(id: string, custom: SkinPackage[] = []): SkinPackage {
  return [...BUILTIN_SKINS, ...custom].find((s) => s.id === id) ?? BUILTIN_SKINS[0];
}
