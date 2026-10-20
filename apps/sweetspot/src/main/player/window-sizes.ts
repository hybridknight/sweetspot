export type PlayerWindowSize = { width: number; height: number };
export type PlayerSkin = { id: string; width: number };

type SizeSettings = {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => unknown;
};
const key = "playerSkinSizes";

/** Content dimensions stay consistent with the renderer's panel resizing. */
export class SkinWindowSizes {
  constructor(private settings: SizeSettings) {}
  get(id: string): PlayerWindowSize | null {
    const raw = this.settings.get(key);
    if (!raw || typeof raw !== "object") return null;
    const size = (raw as Record<string, Partial<PlayerWindowSize>>)[id];
    if (
      !size ||
      typeof size.width !== "number" ||
      typeof size.height !== "number" ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height) ||
      size.width < 360 ||
      size.width > 10000 ||
      size.height < 480 ||
      size.height > 10000
    )
      return null;
    return { width: Math.round(size.width), height: Math.round(size.height) };
  }
  save(id: string, size: PlayerWindowSize) {
    const raw = this.settings.get(key);
    this.settings.set(key, {
      ...(raw && typeof raw === "object" ? raw : {}),
      [id]: size,
    });
  }
}
