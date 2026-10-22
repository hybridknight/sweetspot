import { isMusicUrl } from "@shared/signIn";
import { describe, expect, it } from "vitest";
import {
  type BrowserCookie,
  browserCookies,
  cookieKey,
  isYoutubeDomain,
  storedCookie,
} from "./cookies";

const auth: BrowserCookie = {
  name: "SAPISID",
  value: "test-only",
  domain: ".youtube.com",
  path: "/",
  secure: true,
  httpOnly: true,
  expires: 2000,
  session: false,
  sameSite: "None",
};
describe("cookie transfer boundaries", () => {
  it.each(["youtube.com", ".youtube.com", "music.youtube.com", ".music.youtube.com"])(
    "accepts %s",
    (domain) => expect(isYoutubeDomain(domain)).toBe(true),
  );
  it.each(["evilyoutube.com", "youtube.com.evil.test", "google.com", "youtube.com/", ""])(
    "rejects %s",
    (domain) => expect(isYoutubeDomain(domain)).toBe(false),
  );
  it("preserves browser cookie attributes and expiration", () => {
    expect(browserCookies([auth], 1000)).toEqual([
      {
        url: "https://youtube.com/",
        domain: ".youtube.com",
        path: "/",
        name: "SAPISID",
        value: "test-only",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction",
        expirationDate: 2000,
      },
    ]);
  });
  it("preserves host-only and session-only semantics", () => {
    const [cookie] = browserCookies(
      [{ ...auth, domain: "music.youtube.com", session: true, expires: -1 }],
      1000,
    );
    expect(cookie).not.toHaveProperty("domain");
    expect(cookie).not.toHaveProperty("expirationDate");
  });
  it.each(["Strict", "Lax", undefined] as const)("maps SameSite %s", (sameSite) => {
    expect(browserCookies([{ ...auth, sameSite }], 1000)[0].sameSite).toBe(
      sameSite === "Strict" ? "strict" : sameSite === "Lax" ? "lax" : "unspecified",
    );
  });
  it("keeps usable authentication when an optional cookie is partitioned", () => {
    const cookies = browserCookies(
      [
        auth,
        {
          ...auth,
          name: "YSC",
          partitionKey: { topLevelSite: "https://youtube.com", hasCrossSiteAncestor: false },
        },
      ],
      1000,
    );
    expect(cookies.map((cookie) => cookie.name)).toEqual(["SAPISID"]);
    expect(cookies.every((cookie) => !("partitionKey" in cookie))).toBe(true);
  });
  it("does not reject YouTube auth because an unrelated browser cookie has a different shape", () => {
    expect(
      browserCookies([auth, { domain: "accounts.google.com" } as BrowserCookie], 1000),
    ).toHaveLength(1);
  });
  it("retains duplicate names across domains and paths", () => {
    expect(
      browserCookies(
        [auth, { ...auth, path: "/music" }, { ...auth, domain: "music.youtube.com" }],
        1000,
      ),
    ).toHaveLength(3);
  });
  it("drops expired and unrelated cookies", () => {
    expect(
      browserCookies(
        [auth, { ...auth, name: "old", expires: 999 }, { ...auth, domain: ".google.com" }],
        1000,
      ),
    ).toHaveLength(1);
  });
  it.each([{ expires: 500 }, { value: "" }, { domain: "evilyoutube.com" }])(
    "rejects an incomplete session: %j",
    (change) => expect(() => browserCookies([{ ...auth, ...change }], 1000)).toThrow(),
  );
  it.each([
    { partitionKey: { topLevelSite: "https://youtube.com" } },
    { partitionKeyOpaque: true },
  ])("refuses to broaden a partitioned session: %j", (change) =>
    expect(() => browserCookies([{ ...auth, ...change }], 1000)).toThrow(),
  );
  it.each([
    { name: "__Host-example", domain: ".youtube.com" },
    { name: "__Host-example", domain: "youtube.com", path: "/bad" },
    { name: "__Secure-example", secure: false },
  ])("rejects invalid cookie prefixes: %j", (change) =>
    expect(() => browserCookies([auth, { ...auth, ...change }], 1000)).toThrow(),
  );
  it("reconstructs host-only stored cookies for rollback", () => {
    expect(
      storedCookie({
        name: "a",
        value: "b",
        domain: "music.youtube.com",
        hostOnly: true,
        secure: true,
        session: true,
        sameSite: "lax",
      }),
    ).not.toHaveProperty("domain");
  });
  it("keeps cookie identity independent of value", () => {
    expect(cookieKey(auth)).toBe(cookieKey({ ...auth, domain: "youtube.com" }));
    expect(cookieKey(auth)).not.toBe(cookieKey({ ...auth, path: "/music" }));
  });
  it.each([
    "http://music.youtube.com",
    "https://music.youtube.com.evil.test/",
    "https://music.youtube.evil/",
    "invalid",
  ])("rejects false music success URL %s", (url) => expect(isMusicUrl(url)).toBe(false));
  it("recognizes the exact HTTPS music origin", () =>
    expect(isMusicUrl("https://music.youtube.com/library")).toBe(true));
});
