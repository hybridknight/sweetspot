import { describe, expect, it } from "vitest";
import { BUILTIN_SKINS } from "./builtins";
import { skinMediaGeometry, skinMediaPolicy } from "./media";

describe("skin video geometry", () => {
  it("keeps defaults and minimums usable within narrow and wide landscape panes", () => {
    for (const skin of BUILTIN_SKINS) {
      for (const width of [240, 360, 460, 720, 1000]) {
        const geometry = skinMediaGeometry(skin, width);
        expect(geometry.minimum).toBeGreaterThanOrEqual(112);
        expect(geometry.defaultHeight).toBeGreaterThanOrEqual(geometry.minimum);
        expect(geometry.defaultHeight).toBeLessThanOrEqual(width * 9 / 16);
        expect(geometry.defaultHeight).toBeLessThanOrEqual(geometry.maximumDefault);
      }
    }
  });
  it("lets cinematic and glass backdrops show through letterboxing", () => {
    for (const id of ["builtin-spotlight", "builtin-aurora"]) {
      const skin = BUILTIN_SKINS.find(skin => skin.id === id)!;
      expect(skinMediaPolicy(skin).backdrop).toBe("transparent");
      expect(skinMediaPolicy({ ...skin, id: "my-custom-skin" })).toEqual(skinMediaPolicy(skin));
    }
  });
});
