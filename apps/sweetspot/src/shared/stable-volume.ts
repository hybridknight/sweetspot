export const STABLE_VOLUME_SETTING = "player.stableVolumeEnabled";

/** Missing preferences default on; an explicit off choice always survives upgrades. */
export function readStableVolumeEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}
