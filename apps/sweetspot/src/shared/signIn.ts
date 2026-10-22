export type SignInStage =
  | "discovering"
  | "opening"
  | "waiting"
  | "verifying"
  | "fallback"
  | "error";
export interface SignInStatus {
  id: string;
  stage: SignInStage;
  browser?: string;
  reason?: "unavailable" | "browser" | "timeout" | "transfer" | "manual" | "fallback";
}

export const GOOGLE_SIGN_IN_URL =
  "https://accounts.google.com/ServiceLogin?" +
  new URLSearchParams({
    ltmpl: "music",
    service: "youtube",
    continue:
      "https://www.youtube.com/signin?action_handle_signin=true&app=desktop&next=https://music.youtube.com/",
  }).toString();

export function isMusicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "music.youtube.com";
  } catch {
    return false;
  }
}

// Read only readiness on the exact music origin. Music deployments can expose the
// login flag through different config shapes, or render the account avatar first.
export const SIGNED_IN_SCRIPT = `(() => {
  if (location.protocol !== 'https:' || location.hostname !== 'music.youtube.com') return false;
  let loggedIn;
  try {
    const config = globalThis.ytcfg;
    loggedIn = typeof config?.get === 'function' ? config.get('LOGGED_IN') : undefined;
    loggedIn ??= config?.data_?.LOGGED_IN ?? config?.data?.LOGGED_IN;
  } catch { /* The account control can still confirm the loaded music document. */ }
  if (loggedIn === true || loggedIn === 1 || loggedIn === 'true') return true;
  const avatar = document.querySelector('ytmusic-settings-button img[src], ytmusic-nav-bar #avatar-btn img[src]');
  return Boolean(avatar && !avatar.closest('[hidden]') && avatar.getClientRects().length);
})()`;
