import { randomUUID } from "node:crypto";
import type { SignInStatus } from "@shared/signIn";
import { SignInError } from "./async";
import type { InstalledBrowser } from "./browserDiscovery";

export interface SignInDependencies {
  discover: (signal: AbortSignal) => Promise<InstalledBrowser[]>;
  browser: (
    browser: InstalledBrowser,
    signal: AbortSignal,
    waiting: () => void,
    verifying: () => void,
    launched: () => void,
  ) => Promise<void>;
  embedded: (signal: AbortSignal) => Promise<boolean>;
  update: (status: SignInStatus) => void;
}

/** A single owned attempt. Browser failure falls back once; retries are explicit. */
export class SignInFlow {
  readonly id = randomUUID();
  private controller = new AbortController();
  private cancelled = false;
  private manual = false;
  private stage: SignInStatus["stage"] = "discovering";
  private retryResolve?: (retry: boolean) => void;
  private running?: Promise<boolean>;
  constructor(private readonly deps: SignInDependencies) {}
  private update(stage: SignInStatus["stage"], extra: Partial<SignInStatus> = {}) {
    this.stage = stage;
    this.deps.update({ id: this.id, stage, ...extra });
  }
  cancel() {
    this.cancelled = true;
    this.controller.abort();
    this.retryResolve?.(false);
  }
  useEmbedded() {
    if (!["discovering", "opening", "waiting", "verifying"].includes(this.stage)) return;
    this.manual = true;
    this.controller.abort();
  }
  retry() {
    this.retryResolve?.(true);
  }

  run(): Promise<boolean> {
    return (this.running ??= this.execute());
  }
  private async execute(): Promise<boolean> {
    let reason: SignInStatus["reason"] = "unavailable";
    this.update("discovering");
    try {
      const browsers = await this.deps.discover(this.controller.signal);
      if (this.cancelled) return false;
      for (const browser of browsers) {
        let visible = false;
        this.update("opening", { browser: browser.name });
        try {
          await this.deps.browser(
            browser,
            this.controller.signal,
            () => {
              visible = true;
              this.update("waiting", { browser: browser.name });
            },
            () => this.update("verifying", { browser: browser.name }),
            () => {
              visible = true;
            },
          );
          return !this.cancelled && !this.manual;
        } catch (error) {
          // An unsafe rollback must never proceed into another sign-in method.
          if (error instanceof SignInError && error.code === "rollback") throw error;
          if (this.cancelled) return false;
          reason =
            error instanceof SignInError && error.code === "timeout"
              ? "timeout"
              : visible
                ? "transfer"
                : "browser";
          if (visible || this.manual) break;
        }
      }
    } catch (error) {
      if (error instanceof SignInError && error.code === "rollback") {
        if (this.cancelled) throw error;
        this.update("error", { reason: "transfer" });
        // Wait for dismissal, but don't permit a retry against an uncertain cookie store.
        await new Promise<boolean>((resolve) => {
          this.retryResolve = () => resolve(false);
          if (this.cancelled) resolve(false);
        });
        return false;
      }
      if (this.cancelled) return false;
      reason = "browser";
    }
    if (this.cancelled) return false;
    if (this.manual) reason = "manual";
    this.controller = new AbortController();
    while (!this.cancelled) {
      this.update("fallback", { reason });
      try {
        return await this.deps.embedded(this.controller.signal);
      } catch {
        if (this.cancelled) return false;
        const retry = new Promise<boolean>((resolve) => {
          this.retryResolve = resolve;
        });
        this.update("error", { reason: "fallback" });
        if (!(await retry) || this.cancelled) return false;
        this.retryResolve = undefined;
      }
    }
    return false;
  }
}
