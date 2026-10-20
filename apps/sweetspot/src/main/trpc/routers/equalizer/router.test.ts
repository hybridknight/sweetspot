import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEqSettings } from "@shared/equalizer";
import type { AppTrpcContext } from "@shared/trpc/context";
import { equalizerRouter } from "./router";

vi.mock("@main/ytm/ytm-client", () => ({
  YtmClient: {
    cmdTimed: vi.fn(async () => ({
      state: "enabled",
      message: "Active",
      sampleRate: 48000,
      headroomDb: -3,
    })),
  },
}));

describe("equalizer settings mutations", () => {
  let stored = defaultEqSettings();
  const settings = {
    get: () => stored,
    set: (_key: string, value: typeof stored) => {
      stored = JSON.parse(JSON.stringify(value));
    },
  };
  const caller = equalizerRouter.createCaller({
    getProvider: () => settings,
    event: { sender: null },
    getBrowserWindow: () => null,
  } as AppTrpcContext);
  beforeEach(() => {
    stored = defaultEqSettings();
  });
  it("saves, loads, updates, renames and deletes without changing the current curve", async () => {
    const gains = [0, 1, 2, 3, 4, 0, -1, -2, -3, -4];
    await caller.commit({ enabled: true, gains, autoHeadroom: true });
    const saved = await caller.savePreset({ name: "Headphones", gains });
    const id = saved.presets[0].id;
    await caller.commit({ enabled: false, gains: Array(10).fill(-1), autoHeadroom: true });
    expect(stored.presets[0].gains).toEqual(gains);
    await caller.savePreset({ replaceId: id, name: "Headphones", gains: Array(10).fill(2) });
    await caller.renamePreset({ id, name: "Evening" });
    expect(stored.presets).toEqual([{ id, name: "Evening", gains: Array(10).fill(2) }]);
    await caller.deletePreset({ id });
    expect(stored.presets).toEqual([]);
    expect(stored.enabled).toBe(false);
    expect(stored.gains).toEqual(Array(10).fill(-1));
  });
  it("keeps presets added by another panel when committing playback settings", async () => {
    await caller.savePreset({ name: "One", gains: Array(10).fill(1) });
    await caller.savePreset({ name: "Two", gains: Array(10).fill(2) });
    await caller.commit({ enabled: true, gains: Array(10).fill(3), autoHeadroom: false });
    expect(stored.presets.map((p) => p.name)).toEqual(["One", "Two"]);
  });
  it("rejects invalid gains and duplicate/reserved names without modifying storage", async () => {
    await expect(
      caller.commit({ enabled: true, gains: Array(10).fill(13), autoHeadroom: true }),
    ).rejects.toThrow();
    await expect(caller.savePreset({ name: "Warm", gains: Array(10).fill(0) })).rejects.toThrow();
    await caller.savePreset({ name: "Desk", gains: Array(10).fill(0) });
    await expect(caller.savePreset({ name: " desk ", gains: Array(10).fill(0) })).rejects.toThrow();
    await expect(caller.renamePreset({ id: "flat", name: "Mine" })).rejects.toThrow();
    expect(stored.presets).toHaveLength(1);
    expect(stored.enabled).toBe(false);
  });
  it("preview does not write durable settings", async () => {
    await caller.preview({ enabled: true, gains: Array(10).fill(4), autoHeadroom: true });
    expect(stored).toEqual(defaultEqSettings());
  });
});
