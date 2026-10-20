import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("electronTRPC", {
  sendMessage: (operation: unknown) => ipcRenderer.send("electron-trpc", operation),
  onMessage: (callback: (message: unknown) => void) =>
    ipcRenderer.on("electron-trpc", (_event, message) => callback(message)),
});
