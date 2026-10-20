import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("app", {
  platform: process.platform,
  version: "Current source",
  isDev: false,
});
contextBridge.exposeInMainWorld("electronTRPC", {
  sendMessage: (operation: unknown) => ipcRenderer.send("electron-trpc", operation),
  onMessage: (callback: any) => ipcRenderer.on("electron-trpc", (_e, message) => callback(message)),
});
