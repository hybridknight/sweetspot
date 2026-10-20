import { ipcMain, type IpcMainEvent, type WebContents } from "electron";
import { getYoutubeView } from "@main/lifecycle";
import { createSendHandler } from "@main/ipc/ipc";
import {
  emptySpectrum,
  isSpectrumFrame,
  SPECTRUM_CHANNEL,
  SPECTRUM_SAMPLE_MS,
  type SpectrumFrame,
} from "@shared/skins/spectrum";
import { pluginCmdChannel } from "@shared/ytm";

const listeners = new Set<(frame: SpectrumFrame) => void>();
let source: WebContents | undefined;
let lastFrameAt = -Infinity;
let lastFrame = emptySpectrum();
let commands = Promise.resolve();
function configure(contents: WebContents, enabled: boolean) {
  // Serialize start/stop so a rapid hide/show cannot disconnect a newer stream.
  commands = commands
    .catch(() => {})
    .then(async () => {
      if (contents.isDestroyed()) return;
      try {
        const view = getYoutubeView();
        if (!view || view.webContents !== contents) return;
        const frame = await createSendHandler<unknown>(
          view,
          pluginCmdChannel("equalizer", "spectrum"),
          { timeout: 1000 },
        )(enabled, true);
        if (enabled && source === contents && isSpectrumFrame(frame)) {
          lastFrame = frame;
          for (const listener of listeners) listener(frame);
        }
      } catch {
        if (enabled && source === contents)
          for (const listener of listeners) listener(emptySpectrum());
      }
    });
}
function receive(event: IpcMainEvent, frame: unknown) {
  if (!source || event.sender !== source || !isSpectrumFrame(frame)) return;
  const now = performance.now();
  // Bound even a compromised page's valid numeric stream; skins cannot send here.
  if (now - lastFrameAt < SPECTRUM_SAMPLE_MS * 0.8) return;
  lastFrameAt = now;
  lastFrame = frame;
  for (const listener of listeners) listener(frame);
}
function reload() {
  lastFrameAt = -Infinity;
  if (source && listeners.size) configure(source, true);
}
export function subscribeSpectrum(listener: (frame: SpectrumFrame) => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    source = getYoutubeView()?.webContents;
    lastFrameAt = -Infinity;
    lastFrame = emptySpectrum();
    ipcMain.on(SPECTRUM_CHANNEL, receive);
    source?.on("did-finish-load", reload);
    if (source) configure(source, true);
    else listener(emptySpectrum());
  } else listener(lastFrame);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    listeners.delete(listener);
    if (listeners.size) return;
    ipcMain.off(SPECTRUM_CHANNEL, receive);
    source?.off("did-finish-load", reload);
    if (source) configure(source, false);
    source = undefined;
  };
}
