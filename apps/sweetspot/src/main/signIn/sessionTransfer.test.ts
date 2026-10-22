import type { Cookie, CookiesSetDetails, Session } from "electron";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: vi.fn(), session: {} }));

import { cookieKey } from "./cookies";
import { commitSession } from "./sessionTransfer";

function fixture() {
  const values = new Map<string, Cookie>();
  const original = {
    name: "SAPISID",
    value: "original",
    domain: ".youtube.com",
    path: "/",
    secure: true,
    session: false,
    expirationDate: 4000,
    sameSite: "no_restriction",
  } as Cookie;
  const unrelated = { ...original, name: "app", domain: "example.com", value: "untouched" };
  values.set(cookieKey(original), original);
  values.set(cookieKey(unrelated), unrelated);
  const set = vi.fn(async (cookie: CookiesSetDetails) => {
    const key = cookieKey({ ...cookie, domain: cookie.domain ?? new URL(cookie.url).hostname });
    if (cookie.expirationDate === 1) values.delete(key);
    else
      values.set(key, {
        ...cookie,
        domain: cookie.domain ?? new URL(cookie.url).hostname,
        hostOnly: !cookie.domain,
        session: !cookie.expirationDate,
      } as Cookie);
  });
  const ses = {
    cookies: {
      get: async () => [...values.values()],
      set,
      flushStore: vi.fn(async () => undefined),
    },
  } as unknown as Session;
  const candidate = {
    url: "https://youtube.com/",
    name: "SAPISID",
    value: "new",
    domain: ".youtube.com",
    path: "/",
    expirationDate: 5000,
    secure: true,
    sameSite: "no_restriction",
  } as CookiesSetDetails;
  return { ses, values, set, original, unrelated, candidate };
}

describe("verified session commit", () => {
  it("verifies the new session before reporting success and leaves other origins alone", async () => {
    const { ses, values, candidate, unrelated } = fixture();
    await commitSession(ses, [candidate], new AbortController().signal, async () => {
      expect(values.get(cookieKey(candidate))?.value).toBe("new");
    });
    expect(values.get(cookieKey(unrelated))?.value).toBe("untouched");
    expect(ses.cookies.flushStore).toHaveBeenCalled();
  });
  it("restores the original scope and removes cookies created by failed verification", async () => {
    const { ses, values, candidate, original } = fixture();
    await expect(
      commitSession(ses, [candidate], new AbortController().signal, async () => {
        await ses.cookies.set({ ...candidate, name: "verification-added" });
        throw new Error("signed out");
      }),
    ).rejects.toThrow("signed out");
    expect(values.get(cookieKey(original))?.value).toBe("original");
    expect([...values.values()].some((cookie) => cookie.name === "verification-added")).toBe(false);
  });
  it("restores overwritten cookies after a partial write failure", async () => {
    const { ses, values, set, candidate, original } = fixture();
    set.mockRejectedValueOnce(new Error("write failed"));
    await expect(
      commitSession(ses, [candidate], new AbortController().signal, async () => undefined),
    ).rejects.toThrow("write failed");
    expect(values.get(cookieKey(original))?.value).toBe("original");
  });
  it("rolls back cancellation during verification before returning", async () => {
    const { ses, values, candidate, original } = fixture();
    const controller = new AbortController();
    await expect(
      commitSession(ses, [candidate], controller.signal, async () => controller.abort()),
    ).rejects.toThrow();
    expect(values.get(cookieKey(original))?.value).toBe("original");
  });
  it("reports a fatal rollback failure instead of hiding it", async () => {
    const { ses, set, candidate } = fixture();
    set.mockRejectedValue(new Error("disk unavailable"));
    await expect(
      commitSession(ses, [candidate], new AbortController().signal, async () => undefined),
    ).rejects.toMatchObject({ code: "rollback" });
  });
});
