import type { Cookie, CookiesSetDetails } from "electron";
import { SignInError } from "./async";

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expires: number;
  session: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  partitionKey?: unknown;
  partitionKeyOpaque?: boolean;
}

export function isYoutubeDomain(domain: string): boolean {
  const host = domain.replace(/^\./, "").toLowerCase();
  return host === "youtube.com" || host.endsWith(".youtube.com");
}

export function cookieKey(cookie: { domain?: string; path?: string; name?: string }): string {
  return JSON.stringify([
    cookie.domain?.replace(/^\./, "").toLowerCase(),
    cookie.path ?? "/",
    cookie.name,
  ]);
}

export function browserCookies(
  cookies: BrowserCookie[],
  now = Date.now() / 1000,
): CookiesSetDetails[] {
  const mapped: CookiesSetDetails[] = [];
  if (!Array.isArray(cookies) || cookies.length > 4096) throw new SignInError("transfer");
  for (const cookie of cookies) {
    if (!cookie || typeof cookie.domain !== "string") throw new SignInError("transfer");
    if (!isYoutubeDomain(cookie.domain)) continue;
    // Electron cannot preserve CHIPS partition keys. Leave those cookies behind;
    // never convert them into broader, unpartitioned cookies. Required auth is
    // checked below and the transferred page is independently verified.
    if (cookie.partitionKey || cookie.partitionKeyOpaque) continue;
    if (
      !cookie ||
      typeof cookie.domain !== "string" ||
      typeof cookie.name !== "string" ||
      typeof cookie.value !== "string" ||
      typeof cookie.path !== "string" ||
      typeof cookie.secure !== "boolean" ||
      typeof cookie.httpOnly !== "boolean" ||
      typeof cookie.session !== "boolean" ||
      !Number.isFinite(cookie.expires)
    )
      throw new SignInError("transfer");
    if (!cookie.session && cookie.expires <= now) continue;
    if (!cookie.path.startsWith("/") || /[\r\n\0]/.test(cookie.name + cookie.value))
      throw new SignInError("transfer");
    const host = cookie.domain.replace(/^\./, "");
    if (!/^[a-z0-9.-]+$/i.test(host)) throw new SignInError("transfer");
    const domain = cookie.domain.startsWith(".") ? cookie.domain : undefined;
    if (cookie.name.startsWith("__Host-") && (!cookie.secure || domain || cookie.path !== "/"))
      throw new SignInError("transfer");
    if (cookie.name.startsWith("__Secure-") && !cookie.secure) throw new SignInError("transfer");
    mapped.push({
      url: `https://${host}${cookie.path}`,
      name: cookie.name,
      value: cookie.value,
      ...(domain ? { domain } : {}),
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      ...(!cookie.session && cookie.expires > 0 ? { expirationDate: cookie.expires } : {}),
      sameSite:
        cookie.sameSite === "None"
          ? "no_restriction"
          : cookie.sameSite === "Strict"
            ? "strict"
            : cookie.sameSite === "Lax"
              ? "lax"
              : "unspecified",
    });
  }
  if (
    !mapped.some(
      (cookie) =>
        ["SAPISID", "__Secure-3PAPISID", "__Secure-1PAPISID"].includes(cookie.name ?? "") &&
        cookie.value,
    )
  )
    throw new SignInError("transfer");
  return mapped;
}

export function storedCookie(cookie: Cookie): CookiesSetDetails {
  return {
    url: `https://${cookie.domain?.replace(/^\./, "")}${cookie.path ?? "/"}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path ?? "/",
    ...(!cookie.hostOnly ? { domain: cookie.domain } : {}),
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    ...(!cookie.session && cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
  };
}
