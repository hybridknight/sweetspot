import type { SignInStatus } from "@shared/signIn";
import { describe, expect, it, vi } from "vitest";
import { SignInError } from "./async";
import { BROWSERS } from "./browserDiscovery";
import { type SignInDependencies, SignInFlow } from "./flow";

const installed = BROWSERS.map((browser) => ({
  id: browser.id,
  name: browser.name,
  executable: `/fake/${browser.id}`,
}));
function fixture(overrides: Partial<SignInDependencies> = {}) {
  const updates: SignInStatus[] = [];
  const deps = {
    discover: vi.fn(async () => [installed[0]]),
    browser: vi.fn(async (_browser, _signal, waiting, verifying) => {
      waiting();
      verifying();
    }),
    embedded: vi.fn(async () => true),
    update: vi.fn((status: SignInStatus) => updates.push(status)),
    ...overrides,
  } as SignInDependencies;
  return { flow: new SignInFlow(deps), deps, updates };
}

describe("browser-first sign-in", () => {
  it("surfaces a failed rollback even if cancellation was requested", async () => {
    const { flow, deps, updates } = fixture({
      browser: async (_browser, signal, waiting) => {
        waiting();
        await new Promise((resolve) => signal.addEventListener("abort", resolve));
        throw new SignInError("rollback");
      },
    });
    const done = flow.run();
    const rejected = expect(done).rejects.toMatchObject({ code: "rollback" });
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("waiting"));
    flow.cancel();
    await rejected;
    expect(deps.embedded).not.toHaveBeenCalled();
  });

  it("succeeds without ever opening fallback, and shares concurrent calls", async () => {
    const { flow, deps, updates } = fixture();
    const result = flow.run();
    expect(flow.run()).toBe(result);
    expect(await result).toBe(true);
    expect(deps.embedded).not.toHaveBeenCalled();
    expect(updates.map((state) => state.stage)).toEqual([
      "discovering",
      "opening",
      "waiting",
      "verifying",
    ]);
  });
  it.each([{ browsers: [] }, { browsers: installed.slice(0, 1) }])(
    "falls back once for absent or broken browsers: %j",
    async ({ browsers }) => {
      const { flow, deps } = fixture({
        discover: async () => browsers,
        browser: async () => {
          throw new SignInError("browser");
        },
      });
      expect(await flow.run()).toBe(true);
      expect(deps.embedded).toHaveBeenCalledTimes(1);
    },
  );
  it("tries remaining installations only before interactive sign-in", async () => {
    const browser = vi
      .fn()
      .mockRejectedValueOnce(new SignInError("browser"))
      .mockResolvedValueOnce(undefined);
    const { flow, deps } = fixture({ discover: async () => installed, browser });
    expect(await flow.run()).toBe(true);
    expect(browser).toHaveBeenCalledTimes(2);
    expect(deps.embedded).not.toHaveBeenCalled();
  });
  it("does not open more browsers after a visible attempt fails", async () => {
    const browser = vi.fn(async (_browser, _signal, waiting) => {
      waiting();
      throw new SignInError("timeout");
    });
    const { flow, deps, updates } = fixture({ discover: async () => installed, browser });
    expect(await flow.run()).toBe(true);
    expect(browser).toHaveBeenCalledTimes(1);
    expect(deps.embedded).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toMatchObject({ stage: "fallback", reason: "timeout" });
  });
  it("does not open another browser after a process starts but its debugging connection fails", async () => {
    const browser = vi.fn(async (_browser, _signal, _waiting, _verifying, launched) => {
      launched();
      throw new SignInError("browser");
    });
    const { flow, deps } = fixture({ discover: async () => installed, browser });
    expect(await flow.run()).toBe(true);
    expect(browser).toHaveBeenCalledTimes(1);
    expect(deps.embedded).toHaveBeenCalledTimes(1);
  });
  it("cancellation during discovery never starts another method", async () => {
    const { flow, deps } = fixture({
      discover: (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    });
    const done = flow.run();
    flow.cancel();
    expect(await done).toBe(false);
    expect(deps.browser).not.toHaveBeenCalled();
    expect(deps.embedded).not.toHaveBeenCalled();
  });
  it("switch waits for browser cleanup before opening fallback", async () => {
    const events: string[] = [];
    const { flow, updates } = fixture({
      browser: async (_browser, signal, waiting) => {
        waiting();
        try {
          await new Promise((_, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason)),
          );
        } finally {
          await Promise.resolve();
          events.push("cleaned");
        }
      },
      embedded: async () => {
        events.push("embedded");
        return true;
      },
    });
    const done = flow.run();
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("waiting"));
    flow.useEmbedded();
    expect(await done).toBe(true);
    expect(events).toEqual(["cleaned", "embedded"]);
    expect(updates.at(-1)?.reason).toBe("manual");
  });
  it("cancellation during browser cleanup suppresses fallback", async () => {
    const { flow, deps, updates } = fixture({
      browser: async (_b, signal, waiting) => {
        waiting();
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason)),
        );
      },
    });
    const done = flow.run();
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("waiting"));
    flow.cancel();
    expect(await done).toBe(false);
    expect(deps.embedded).not.toHaveBeenCalled();
  });
  it("fallback cancellation ends instead of retrying automatically", async () => {
    const { flow, deps } = fixture({
      discover: async () => [],
      embedded: vi.fn(async () => false),
    });
    expect(await flow.run()).toBe(false);
    expect(deps.embedded).toHaveBeenCalledTimes(1);
  });
  it("fallback failure waits for explicit retry", async () => {
    const embedded = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(true);
    const { flow, updates } = fixture({ discover: async () => [], embedded });
    const done = flow.run();
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("error"));
    expect(embedded).toHaveBeenCalledTimes(1);
    flow.retry();
    expect(await done).toBe(true);
    expect(embedded).toHaveBeenCalledTimes(2);
  });
  it("can dismiss a failed fallback without retry", async () => {
    const { flow, updates } = fixture({
      discover: async () => [],
      embedded: async () => {
        throw new Error();
      },
    });
    const done = flow.run();
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("error"));
    flow.cancel();
    expect(await done).toBe(false);
  });
  it("blocks fallback if restoring the original session fails", async () => {
    const { flow, deps, updates } = fixture({
      browser: async () => {
        throw new SignInError("rollback");
      },
    });
    const done = flow.run();
    await vi.waitFor(() => expect(updates.at(-1)?.stage).toBe("error"));
    flow.cancel();
    expect(await done).toBe(false);
    expect(deps.embedded).not.toHaveBeenCalled();
  });
});
