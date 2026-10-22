import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Check, LoaderCircle, Music2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import "./sign-in.css";

export const Route = createFileRoute("/youtube/sign-in")({ component: SignInPage });

function SignInPage() {
  const status = trpc.signIn.status.useQuery(undefined, {
    refetchInterval: 350,
    refetchIntervalInBackground: true,
  });
  const control = trpc.signIn.control.useMutation();
  const [error, setError] = useState(false);
  const state = status.data;
  const stage = state?.stage ?? "discovering";
  const failed = stage === "error";
  const verifying = stage === "verifying";
  const waiting = stage === "waiting";
  const busy = control.isLoading;
  const act = async (action: "cancel" | "embedded" | "retry") => {
    if (!state) return;
    setError(false);
    try {
      if (!(await control.mutateAsync({ id: state.id, action }))) setError(true);
    } catch {
      setError(true);
    }
  };
  const title = failed
    ? state?.reason === "transfer"
      ? "Sign-in needs a restart"
      : "Let’s try that again"
    : verifying
      ? "Bringing your music home"
      : waiting
        ? `Continue in ${state?.browser}`
        : "Your music starts here";
  const description = failed
    ? state?.reason === "transfer"
      ? "We couldn’t safely finish transferring your session. Close this window and restart Sweet Spot before trying again."
      : "Sign-in couldn’t finish this time. Check your connection, then try again in Sweet Spot."
    : verifying
      ? "Finishing your sign-in securely. This may take a moment."
      : waiting
        ? "Finish signing in to Google in the browser window. Sweet Spot will take it from there."
        : state?.browser
          ? `Opening a separate ${state.browser} window for your Google sign-in.`
          : "Finding a browser for a smoother Google sign-in.";
  const steps = ["Open your browser", "Sign in to Google", "Return to your music"];
  const activeStep = verifying ? 2 : waiting ? 1 : 0;
  return (
    <div
      className="signin-surface signin-page"
      onKeyDown={(event) => {
        if (event.key === "Escape") void act("cancel");
      }}
    >
      <header className="signin-header drag">
        <Music2 size={17} aria-hidden="true" />
        <span>Sweet Spot</span>
        <span className="signin-header-label">Your account</span>
      </header>
      <main className="signin-main">
        <div role="status" aria-live="polite" aria-atomic="true">
          <p className="signin-eyebrow">{failed ? "Sign-in interrupted" : "Google sign-in"}</p>
          <h1>{title}</h1>
          <p className="signin-description">{description}</p>
        </div>
        {!failed && (
          <ol className="signin-steps" aria-label="Sign-in progress">
            {steps.map((step, index) => (
              <li
                key={step}
                className={index === activeStep ? "active" : index < activeStep ? "complete" : ""}
                aria-current={index === activeStep ? "step" : undefined}
              >
                <span className="signin-step-icon" aria-hidden="true">
                  {index < activeStep ? (
                    <Check size={13} />
                  ) : index === activeStep ? (
                    <LoaderCircle size={14} className="signin-spinner" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        )}
        {!failed && (
          <div className="signin-detail">
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              This window uses a separate profile. Your usual browser stays untouched; you may need
              to sign in again.
            </p>
          </div>
        )}
        {(error || status.isError) && (
          <p className="signin-action-error" role="alert">
            Couldn’t update sign-in. Try again, or close this window to cancel.
          </p>
        )}
      </main>
      <div className="signin-actions">
        {failed ? (
          <>
            {state?.reason === "fallback" && (
              <Button size="xl" disabled={busy} onClick={() => void act("retry")}>
                Try again <ArrowRight size={16} />
              </Button>
            )}
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => void act("cancel")}>
              Close
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="xl"
              disabled={!state || busy || stage === "fallback"}
              onClick={() => void act("embedded")}
            >
              Use in-app sign-in <ArrowRight size={15} />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              disabled={!state || busy}
              onClick={() => void act("cancel")}
            >
              Cancel
            </Button>
          </>
        )}
      </div>
      <footer className="signin-footer">
        Sign in to unlock your library, playlists, and recommendations.
      </footer>
    </div>
  );
}
