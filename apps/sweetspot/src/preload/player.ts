import { contextBridge, ipcRenderer } from "electron";
import { PLAYER_PROCEDURES } from "@shared/skins/access";
// Self-contained sandbox preload: do not import api/base (generic IPC and Node helpers).
const channel = "electron-trpc";
contextBridge.exposeInMainWorld("electronTRPC", {
  sendMessage: (operation: { method?: string; operation?: { path?: string; input?: unknown } }) => {
    if (
      operation.method === "subscription.stop" ||
      (operation.operation?.path && PLAYER_PROCEDURES.has(operation.operation.path))
    )
      ipcRenderer.send(channel, operation);
  },
  onMessage: (callback: (data: unknown) => void) => {
    ipcRenderer.on(channel, (_event, data) => callback(data));
  },
});

// A DOM event carries no API or privileged object into the page.
ipcRenderer.on("player:shown", (_event, state) =>
  window.dispatchEvent(
    new CustomEvent("player-mode-shown", {
      detail: { restoredSize: state?.restoredSize === true },
    }),
  ),
);
contextBridge.exposeInMainWorld("playerPlatform", process.platform);
