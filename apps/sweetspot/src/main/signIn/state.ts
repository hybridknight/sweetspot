import type { SignInStatus } from "@shared/signIn";
import type { SignInFlow } from "./flow";

let active: { flow: SignInFlow; senderId: number; status: SignInStatus } | undefined;
export function setSignInState(flow: SignInFlow, senderId: number, status: SignInStatus) {
  active = { flow, senderId, status };
}
export function clearSignInState(id: string) {
  if (active?.flow.id === id) active = undefined;
}
export function getSignInStatus(): SignInStatus | null {
  return active?.status ?? null;
}
export function controlSignIn(
  senderId: number,
  id: string,
  action: "cancel" | "embedded" | "retry",
): boolean {
  if (!active || active.senderId !== senderId || active.flow.id !== id) return false;
  if (action === "cancel") active.flow.cancel();
  if (action === "embedded") active.flow.useEmbedded();
  if (action === "retry" && active.status.reason === "fallback") active.flow.retry();
  return true;
}
