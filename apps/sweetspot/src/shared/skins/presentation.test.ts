import { describe, expect, it } from "vitest";
import { BUILTIN_SKINS } from "./builtins";
import { exportSkin, parseSkin, settingDefaults } from "./schema";
import { skinPresentation } from "./presentation";

const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};

describe("coordinated skin finishes", () => {
  it("keeps primary text readable in every built-in finish", () => {
    for (const skin of BUILTIN_SKINS) {
      for (const finish of ["original", "graphite", "midnight"]) {
        const palette = skinPresentation(skin, { ...settingDefaults(skin), finish });
        const light = luminance(palette["--skin-text"]);
        const dark = luminance(palette["--skin-surface"]);
        expect(
          (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it("adapts Sleeve's default accent for dark finishes while preserving a custom accent", () => {
    const sleeve = BUILTIN_SKINS.find((s) => s.id === "builtin-sleeve")!;
    const defaults = settingDefaults(sleeve);
    const dark = skinPresentation(sleeve, { ...defaults, finish: "graphite" });
    expect(luminance(dark["--skin-accent"])).toBeGreaterThan(luminance(sleeve.theme.accent));
    expect(
      skinPresentation(sleeve, { ...defaults, finish: "graphite", accent: "#123456" })[
        "--skin-accent"
      ],
    ).toBe("#123456");
    expect(skinPresentation(sleeve, defaults)["--skin-accent"]).toBe(sleeve.theme.accent);
    const imported = parseSkin(exportSkin(sleeve, { ...defaults, accent: "#123456" }));
    expect(skinPresentation(imported, settingDefaults(imported))["--skin-accent"]).toBe("#123456");
  });
});
