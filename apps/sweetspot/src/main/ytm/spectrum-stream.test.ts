import { describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => void>();
  const contents = { isDestroyed: () => false, on: vi.fn(), off: vi.fn() };
  const command = vi.fn(async () => ({ available: true, bands: Array(32).fill(0.5) }));
  return { handlers, contents, command };
});
vi.mock("electron", () => ({
  ipcMain: {
    on: (name: string, handler: (...args: any[]) => void) => mock.handlers.set(name, handler),
    off: (name: string) => mock.handlers.delete(name),
  },
}));
vi.mock("@main/lifecycle", () => ({ getYoutubeView: () => ({ webContents: mock.contents }) }));
vi.mock("@main/ipc/ipc", () => ({ createSendHandler: () => mock.command }));
import { subscribeSpectrum } from "./spectrum-stream";
import { SPECTRUM_CHANNEL } from "@shared/skins/spectrum";

describe("main spectrum relay", () => {
  it("shares one source, authenticates frames, bounds delivery, and stops after the last listener", async () => {
    const first = vi.fn(),
      second = vi.fn();
    const offFirst = subscribeSpectrum(first),
      offSecond = subscribeSpectrum(second);
    await vi.waitFor(() => expect(mock.command).toHaveBeenCalledTimes(1));
    expect(mock.command).toHaveBeenLastCalledWith(true, true);
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    first.mockClear();
    second.mockClear();
    const receive = mock.handlers.get(SPECTRUM_CHANNEL)!;
    const frame = { available: true, bands: Array(32).fill(0.3) };
    receive({ sender: {} }, frame);
    receive({ sender: mock.contents }, { available: true, bands: Array(1000).fill(1) });
    expect(first).not.toHaveBeenCalled();
    receive({ sender: mock.contents }, frame);
    receive({ sender: mock.contents }, frame);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    offFirst();
    expect(mock.handlers.has(SPECTRUM_CHANNEL)).toBe(true);
    expect(mock.command).toHaveBeenCalledTimes(1);
    offSecond();
    expect(mock.handlers.has(SPECTRUM_CHANNEL)).toBe(false);
    await vi.waitFor(() => expect(mock.command).toHaveBeenCalledTimes(2));
    expect(mock.command).toHaveBeenLastCalledWith(false, true);
    expect(mock.contents.off).toHaveBeenCalledWith("did-finish-load", expect.any(Function));
  });
});
