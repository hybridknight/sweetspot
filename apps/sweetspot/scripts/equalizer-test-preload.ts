import { contextBridge, ipcRenderer } from "electron";
import { ELECTRON_TRPC_CHANNEL } from "electron-trpc/main";
import { initializePluginCommandsWithIPC } from "../src/renderer-plugins/utils";
import equalizerPlugin from "../src/renderer-plugins/youtube/equalizer.plugin";

const sweetspot = {
  settings: { get: (key: string) => ipcRenderer.invoke("test:get", key) },
  on: (event: string, handler: (...args: unknown[]) => void) => {
    const wrapped = (_ev: unknown, ...args: unknown[]) => handler(...args);
    ipcRenderer.on(event, wrapped);
    return () => ipcRenderer.off(event, wrapped);
  },
};
contextBridge.exposeInMainWorld("sweetspot", sweetspot);
contextBridge.exposeInMainWorld("electronTRPC", {
  sendMessage: (operation: unknown) => ipcRenderer.send(ELECTRON_TRPC_CHANNEL, operation),
  onMessage: (callback: (message: unknown) => void) =>
    ipcRenderer.on(ELECTRON_TRPC_CHANNEL, (_event, message) => callback(message)),
});
initializePluginCommandsWithIPC(equalizerPlugin, {
  sweetspot: {
    onInternal: sweetspot.on,
    sendInternal: (event: string, ...args: unknown[]) => ipcRenderer.send(event, ...args),
  },
  log: { debug() {}, info() {}, error() {} },
} as any);
