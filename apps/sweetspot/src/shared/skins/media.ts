import type { SkinPackage } from "./schema";

/** Viewing area only: the renderer adds tabs, padding and other panel controls. */
export function skinMediaPolicy(skin: SkinPackage) {
  if (skin.layout.arrangement === "spotlight")
    return { minimum: 180, maximumDefault: 420, backdrop: "transparent" };
  if (skin.layout.arrangement === "album")
    return { minimum: 180, maximumDefault: 400, backdrop: "transparent" };
  if (skin.theme.finish === "glass")
    return { minimum: 160, maximumDefault: 360, backdrop: "transparent" };
  if (skin.theme.finish === "metal")
    return { minimum: 112, maximumDefault: 200, backdrop: "#05070b" };
  if (skin.theme.finish === "pop")
    return { minimum: 144, maximumDefault: 280, backdrop: "transparent" };
  if (skin.theme.finish === "paper")
    return { minimum: 144, maximumDefault: 300, backdrop: "transparent" };
  return { minimum: 144, maximumDefault: 320, backdrop: "#05070b" };
}

export function skinMediaGeometry(skin: SkinPackage, width: number) {
  const policy = skinMediaPolicy(skin);
  const landscapeHeight =
    (Math.max(1, Number.isFinite(width) ? width : skin.layout.width) * 9) / 16;
  const minimum = Math.min(policy.minimum, landscapeHeight);
  return {
    ...policy,
    minimum,
    defaultHeight: Math.max(minimum, Math.min(policy.maximumDefault, landscapeHeight)),
  };
}
