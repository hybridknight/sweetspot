import { createFileRoute } from "@tanstack/react-router";
import { Info, Music2 } from "lucide-react";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/youtube/login-notice")({ component: LoginNoticePage });

function LoginNoticePage() {
  const { data } = trpc.signIn.status.useQuery();
  const manual = data?.reason === "manual";
  const unavailable = data?.reason === "unavailable";
  return (
    <div className="h-full overflow-auto border-b border-white/10 bg-[#17151e] px-6 py-4 text-[#eee9f8]">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Music2 size={16} aria-hidden="true" /> Continue in Sweet Spot
      </div>
      <p className="mb-2 text-xs leading-relaxed text-[#beb6cc]">
        {manual
          ? "You’re using in-app sign-in."
          : unavailable
            ? "A supported browser wasn’t available. You can sign in here instead."
            : "Browser sign-in couldn’t finish. You can sign in here instead."}
      </p>
      <div className="flex items-start gap-2 text-xs leading-relaxed text-[#cec2dd]">
        <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Stuck on a passkey? Choose <strong>Try another way</strong> for another verification
          method. You can resize this window to reach all of Google’s buttons.
        </p>
      </div>
    </div>
  );
}
