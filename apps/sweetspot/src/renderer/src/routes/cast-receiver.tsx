import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { createFileRoute } from "@tanstack/react-router";
import { CastIcon, XIcon } from "lucide-react";

export const Route = createFileRoute("/cast-receiver")({
	component: CastReceiverPage,
});

function CastReceiverPage() {
	const pending = trpc.chromecast.pending.useQuery(undefined, { refetchInterval: 400 });
	const select = trpc.chromecast.select.useMutation();
	const receivers = pending.data ?? [];
	const busy = select.isLoading;

	function choose(id: string | null) {
		if (busy) return;
		void select.mutateAsync({ id });
	}

	return (
		<div className="flex h-full min-h-screen flex-col gap-4 bg-background p-5">
			<div className="flex min-w-0 flex-col gap-1">
				<h2 className="text-sm font-medium">Cast to a device</h2>
				<p className="text-xs leading-relaxed text-muted-foreground text-pretty">
					Pick a Chromecast on this network. Same LAN and firewall access required.
				</p>
			</div>

			<ScrollArea className="min-h-0 flex-1 rounded-md border border-border">
				<div className="flex flex-col gap-1 p-2">
					{receivers.length === 0 ? (
						<p className="px-2 py-6 text-center text-xs text-muted-foreground">No devices found yet. Wait a few seconds, then try again.</p>
					) : (
						receivers.map((receiver) => (
							<Button
								key={receiver.id}
								type="button"
								variant="ghost"
								className="h-auto w-full justify-start gap-2 py-2 text-left"
								disabled={busy}
								onClick={() => choose(receiver.id)}
							>
								<CastIcon className="size-4 shrink-0" />
								<span className="truncate">{receiver.name}</span>
							</Button>
						))
					)}
				</div>
			</ScrollArea>

			<Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => choose(null)}>
				<XIcon />
				Cancel
			</Button>
		</div>
	);
}
