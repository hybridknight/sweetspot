import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { SIGNED_IN_SCRIPT } from "./signIn";

function probe(
  config: unknown,
  avatar = false,
  hidden = false,
  visible = true,
  hostname = "music.youtube.com",
) {
  const querySelector = vi.fn(() =>
    avatar
      ? {
          closest: () => (hidden ? {} : null),
          getClientRects: () => (visible ? [{}] : []),
        }
      : null,
  );
  const result = runInNewContext(SIGNED_IN_SCRIPT, {
    location: { protocol: "https:", hostname },
    ytcfg: config,
    document: { querySelector },
  });
  return { result, querySelector };
}

describe("live YouTube Music sign-in completion", () => {
  it.each([true, 1, "true"])("recognizes the affirmative login value %s", (value) => {
    expect(probe({ get: () => value }).result).toBe(true);
  });
  it.each([false, 0, "false", "0", "", undefined, null])(
    "does not accept a signed-out config value %s",
    (value) => {
      expect(probe({ get: () => value }).result).toBe(false);
    },
  );
  it("supports config data without a getter", () => {
    expect(probe({ data_: { LOGGED_IN: true } }).result).toBe(true);
    expect(probe({ data: { LOGGED_IN: true } }).result).toBe(true);
  });
  it("recognizes the signed-in account control when the flag is absent", () => {
    const { result, querySelector } = probe({ get: () => undefined }, true);
    expect(result).toBe(true);
    expect(querySelector).toHaveBeenCalledWith(
      "ytmusic-settings-button img[src], ytmusic-nav-bar #avatar-btn img[src]",
    );
  });
  it("handles an absent or throwing config getter", () => {
    expect(probe(undefined, true).result).toBe(true);
    expect(
      probe(
        {
          get: () => {
            throw new Error("not ready");
          },
        },
        true,
      ).result,
    ).toBe(true);
  });
  it("does not mistake a hidden account placeholder for a signed-in page", () => {
    expect(probe(undefined, true, true).result).toBe(false);
    expect(probe(undefined, true, false, false).result).toBe(false);
  });
  it("rejects account controls on an unrelated or deceptive hostname", () => {
    expect(
      probe({ get: () => true }, true, false, true, "music.youtube.com.evil.test").result,
    ).toBe(false);
  });
});
