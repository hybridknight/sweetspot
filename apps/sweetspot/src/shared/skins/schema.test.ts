import { SKIN_FONT_IDS } from "./fonts";
import { describe, expect, it } from "vitest";
import { BUILTIN_SKINS } from "./builtins";
import {
  exportSkin,
  MAX_SKIN_BYTES,
  parseSkin,
  settingDefaults,
  skinPackageSchema,
  validateSkinValues,
} from "./schema";
import { QueueIdentity } from "./queue";
describe("declarative player skins", () => {
  it("exports all built-ins as usable, commented, private-data-free starters", () => {
    for (const skin of BUILTIN_SKINS) {
      const values = { ...settingDefaults(skin), accent: "#123456" };
      const text = exportSkin(skin, values),
        copy = parseSkin(text);
      expect(text).toContain("// Sweet Spot");
      expect(copy.id).toBe(skin.id.replace("builtin-", "my-"));
      expect(copy.settings.find((s) => s.target === "accent")?.default).toBe("#123456");
      expect(copy.guide.length).toBeGreaterThan(4);
      expect(copy.layout.modules).toContain("equalizer");
      expect(copy.settings.some((s) => s.target === "videoExpanded")).toBe(true);
      expect(Object.keys(copy)).not.toContain("playback");
    }
  });
  it("keeps each built-in's recommended typography aligned with its defaults", () => {
    const pairs = [
      ["builtin-focus", "google-inter", "google-manrope"],
      ["builtin-classic", "classic", "classic"],
      ["builtin-sleeve", "google-manrope", "google-cinzel"],
      ["builtin-aurora", "google-inter", "google-cinzel"],
      ["builtin-studio", "google-manrope", "google-manrope"],
      ["builtin-spotlight", "google-inter", "google-manrope"],
    ];
    for (const [id, font, headingFont] of pairs) {
      const skin = BUILTIN_SKINS.find((skin) => skin.id === id)!;
      expect(skin.theme.font).toBe(font);
      expect(skin.theme.headingFont ?? skin.theme.font).toBe(headingFont);
      expect(skin.settings.some((s) => ["font", "headingFont"].includes(s.target))).toBe(false);
      expect(settingDefaults(skin)).not.toHaveProperty("font");
      expect(settingDefaults(skin)).not.toHaveProperty("headingFont");
    }
  });
  it("imports legacy font controls without letting saved choices override the theme", () => {
    const base = BUILTIN_SKINS[0];
    const legacy = skinPackageSchema.parse({
      ...base,
      settings: [
        ...base.settings,
        {
          key: "font",
          target: "font",
          type: "select",
          group: "style",
          label: "Font",
          description: "Legacy font picker",
          default: "mono",
          options: [
            { value: "mono", label: "Mono" },
            { value: "system", label: "System" },
          ],
        },
        {
          key: "headingFont",
          target: "headingFont",
          type: "select",
          group: "style",
          label: "Heading",
          description: "Legacy heading picker",
          default: "mono",
          options: [
            { value: "mono", label: "Mono" },
            { value: "system", label: "System" },
          ],
        },
      ],
    });
    expect(legacy.theme).toEqual(base.theme);
    expect(legacy.settings).toEqual(base.settings);
    const values = validateSkinValues(legacy, { font: "mono", headingFont: "mono" });
    expect(values).not.toHaveProperty("font");
    expect(values).not.toHaveProperty("headingFont");
    expect(parseSkin(exportSkin(legacy, values)).settings).toEqual(base.settings);
  });
  it("keeps glass controls declarative and bounded", () => {
    const aurora = BUILTIN_SKINS.find((s) => s.id === "builtin-aurora")!;
    expect(aurora.theme.finish).toBe("glass");
    expect(aurora.layout.modules.at(-1)).toBe("transport");
    expect(parseSkin(exportSkin(aurora, settingDefaults(aurora))).theme.finish).toBe("glass");
    const change = (target: string, patch: Record<string, unknown>) => ({
      ...aurora,
      settings: aurora.settings.map((s) => (s.target === target ? { ...s, ...patch } : s)),
    });
    expect(skinPackageSchema.safeParse(change("glassOpacity", { max: 101 })).success).toBe(false);
    expect(skinPackageSchema.safeParse(change("radius", { max: 100 })).success).toBe(false);
    expect(
      skinPackageSchema.safeParse(
        change("glassTone", {
          options: [
            { value: "plum", label: "Plum" },
            { value: "remote-script", label: "Custom" },
          ],
        }),
      ).success,
    ).toBe(false);
  });
  it("exports theme fonts without selection controls while rejecting URLs and CSS", () => {
    const skin = BUILTIN_SKINS.find((s) => s.id === "builtin-aurora")!;
    expect(skin.theme.font).toBe("google-inter");
    expect(skin.theme.headingFont).toBe("google-cinzel");
    for (const font of SKIN_FONT_IDS) {
      const copy = parseSkin(
        exportSkin({ ...skin, theme: { ...skin.theme, font } }, { ...settingDefaults(skin), font }),
      );
      expect(copy.theme.font).toBe(font);
      expect(copy.settings.some((s) => ["font", "headingFont"].includes(s.target))).toBe(false);
    }
    for (const font of [
      "https://fonts.googleapis.com/css2?family=Inter",
      "url(file:///secret)",
      "Inter; background:red",
    ])
      expect(skinPackageSchema.safeParse({ ...skin, theme: { ...skin.theme, font } }).success).toBe(
        false,
      );
    const { headingFont, ...legacyTheme } = BUILTIN_SKINS[0].theme;
    expect(skinPackageSchema.safeParse({ ...BUILTIN_SKINS[0], theme: legacyTheme }).success).toBe(
      true,
    );
  });
  it("treats comments as comments only outside quoted values", () => {
    const skin = {
      ...BUILTIN_SKINS[0],
      description: 'Use // for comments; /* is text here */; escaped "quote".',
    };
    expect(parseSkin(`/* intro */\n${JSON.stringify(skin)}//end`).description).toBe(
      skin.description,
    );
    expect(() => parseSkin("/*never closed")).toThrow();
  });
  it("rejects executable content, raw markup, CSS, network assets, and resource abuse", () => {
    const base = BUILTIN_SKINS[1];
    for (const extra of [
      { script: "alert(1)" },
      { html: "<iframe src='file:///etc/passwd'>" },
      { css: "@import url(https://evil.test)" },
      { assets: ["../../secret"] },
      { onload: "run()" },
    ])
      expect(() => parseSkin(JSON.stringify({ ...base, ...extra }))).toThrow();
    for (const shape of [
      { kind: "image", href: "file:///secret" },
      { kind: "path", d: "<script>alert(1)</script>", fill: "#123456" },
      {
        kind: "rect",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        fill: "url(https://evil.test)",
        onclick: "run()",
      },
      { kind: "foreignObject", html: "<img onerror='run()'>" },
    ])
      expect(
        skinPackageSchema.safeParse({ ...base, artwork: { ...base.artwork, panel: [shape] } })
          .success,
      ).toBe(false);
    expect(() => parseSkin(" ".repeat(MAX_SKIN_BYTES + 1))).toThrow("too large");
    expect(
      skinPackageSchema.safeParse({
        ...base,
        layout: { ...base.layout, modules: ["queue", "queue", "queue", "queue"] },
      }).success,
    ).toBe(false);
  });
  it("keeps settings typed, bounded and scoped to supported targets", () => {
    const skin = BUILTIN_SKINS[0];
    expect(
      validateSkinValues(skin, {
        radius: Infinity,
        accent: "javascript:run()",
        finish: "evil",
        showArtist: "false",
      }),
    ).toEqual(settingDefaults(skin));
    expect(
      skinPackageSchema.safeParse({
        ...skin,
        settings: [...skin.settings, { ...skin.settings[0], key: "other" }],
      }).success,
    ).toBe(false);
    expect(
      skinPackageSchema.safeParse({ ...skin, settings: [{ ...skin.settings[0], target: "shell" }] })
        .success,
    ).toBe(false);
  });
});
describe("queue occurrence identity", () => {
  const item = (title: string) => ({
    playlistPanelVideoRenderer: { videoId: "duplicate", title: { simpleText: title } },
  });
  it("only exposes trusted music-CDN artwork in the queue", () => {
    const snapshot = (url: string) =>
      new QueueIdentity().snapshot(
        [
          {
            playlistPanelVideoRenderer: {
              videoId: "a",
              title: { simpleText: "Song" },
              thumbnail: { thumbnails: [{ url }] },
            },
          },
        ],
        "a",
      )[0];
    expect(snapshot("https://i.ytimg.com/vi/a/default.jpg").thumbnail).toBe(
      "https://i.ytimg.com/vi/a/default.jpg",
    );
    expect(snapshot("file:///private/secret.png").thumbnail).toBeUndefined();
    expect(snapshot("https://evil.test/image.png").thumbnail).toBeUndefined();
  });
  it("distinguishes duplicate tracks and invalidates stale selection after reorder", () => {
    const ids = new QueueIdentity(),
      a = item("A"),
      b = item("B");
    const first = ids.snapshot([a, b], "duplicate"),
      reordered = ids.snapshot([b, a], "duplicate");
    expect(first[0].id).not.toBe(first[1].id);
    expect(reordered[1].id).toBe(first[0].id);
    expect(reordered[0].revision).not.toBe(first[0].revision);
    expect(first.filter((i) => i.current)).toHaveLength(1);
  });
  it("preserves native occurrence IDs across recreated counterpart wrappers", () => {
    const ids = new QueueIdentity();
    const wrap = (key: string) => ({
      playlistPanelVideoWrapperRenderer: {
        primaryRenderer: {
          playlistPanelVideoRenderer: { videoId: "duplicate", playlistSetVideoId: key },
        },
      },
    });
    const first = ids.snapshot([wrap("first"), wrap("second")], "duplicate");
    const refreshed = ids.snapshot([wrap("first"), wrap("second")], "duplicate");
    expect(refreshed.map((i) => i.id)).toEqual(first.map((i) => i.id));
    expect(refreshed[0].revision).toBe(first[0].revision);
    expect(refreshed[0].id).not.toBe(refreshed[1].id);
    expect(ids.snapshot([wrap("second"), wrap("first")], "duplicate")[0].revision).not.toBe(
      first[0].revision,
    );
  });
  it("uses the selected duplicate, and invalidates after removal", () => {
    const ids = new QueueIdentity(),
      a = item("A"),
      b = {
        playlistPanelVideoRenderer: { ...item("B").playlistPanelVideoRenderer, selected: true },
      };
    const first = ids.snapshot([a, b], "duplicate");
    expect(first[0].current).toBe(false);
    expect(first[1].current).toBe(true);
    expect(ids.snapshot([b], "duplicate")[0].revision).not.toBe(first[0].revision);
  });
});
