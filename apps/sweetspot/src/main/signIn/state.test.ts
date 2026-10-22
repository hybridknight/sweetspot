import { afterEach, expect, it, vi } from "vitest";
import { SignInFlow } from "./flow";
import { clearSignInState, controlSignIn, getSignInStatus, setSignInState } from "./state";

const flow = new SignInFlow({
  discover: async () => [],
  browser: async () => undefined,
  embedded: async () => true,
  update: () => undefined,
});
afterEach(() => {
  clearSignInState(flow.id);
  vi.restoreAllMocks();
});

it("only accepts commands from the owning progress window and current attempt", () => {
  const cancel = vi.spyOn(flow, "cancel");
  setSignInState(flow, 42, { id: flow.id, stage: "waiting" });
  expect(controlSignIn(41, flow.id, "cancel")).toBe(false);
  expect(controlSignIn(42, "stale-attempt", "cancel")).toBe(false);
  expect(cancel).not.toHaveBeenCalled();
  expect(controlSignIn(42, flow.id, "cancel")).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(1);
});
it("does not clear a newer attempt when stale cleanup runs", () => {
  setSignInState(flow, 42, { id: flow.id, stage: "waiting" });
  clearSignInState("stale-attempt");
  expect(getSignInStatus()?.id).toBe(flow.id);
});
