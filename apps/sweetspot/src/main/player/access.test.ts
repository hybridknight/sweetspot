import { describe, expect, it } from "vitest";
import { authorizePlayer, isPlayerSender, registerPlayer } from "./access";
describe("sandboxed player procedure access", () => {
  it("rejects broad app APIs on the main side even if a caller bypasses preload filtering", () => {
    const sender = { id: 9 };
    const unregister = registerPlayer(9);
    try {
      expect(isPlayerSender(sender)).toBe(true);
      for (const path of [
        "app.openFile",
        "settings.set",
        "settings.getAll",
        "app.openWindow",
        "navigation.navigate",
        "player.enter",
        "player.exportSkin",
        "player.importSkin",
        "player.select",
        "player.removeSkin",
        "player.previewPreferences",
      ])
        expect(() => authorizePlayer(sender, path)).toThrow();
      for (const path of [
        "player.catalog",
        "player.videoBounds",
        "player.minimumHeight",
        "player.resizeHeight",
        "player.openAppearance",
        "player.onCatalog",
        "player.onPreview",
        "player.videoMode",
        "player.moveQueue",
        "player.queueAction",
        "equalizer.commit",
        "track.next",
      ])
        expect(() => authorizePlayer(sender, path)).not.toThrow();
    } finally {
      unregister();
    }
    expect(isPlayerSender(sender)).toBe(false);
  });
});
