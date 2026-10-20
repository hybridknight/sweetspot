import { HoverTooltip, TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { cn } from "@renderer/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon, PanelsTopLeft, MaximizeIcon, Minimize2, XIcon } from "lucide-react";
import { useMemo } from "react";
import { ToolbarOptions } from "@/components/toolbar-options";
import { useNavigation } from "@/hooks/use-navigation";
import { useMainWindowState } from "@/hooks/use-settings";
import { useWindowControls } from "@/hooks/use-window-controls";

import "./toolbar.css";

export const Route = createFileRoute("/youtube/toolbar")({
	component: YoutubeToolbarPage,
});

function YoutubeToolbarPage() {
	const playerMode = trpc.player.enter.useMutation();
	const isDarwin = useMemo(() => window.app.platform === "darwin", []);
	const [state] = useMainWindowState();
	const { minimize, maximize, quit } = useWindowControls();
	const { goback } = useNavigation();

	const canGoBack = useMemo(() => {
		const nav = state?.navigation;
		return typeof nav === "object" && nav ? nav.canGoBack : false;
	}, [state?.navigation]);

	const toolbar = (
		<div data-toolbar-pane className="h-full overflow-hidden">
			<div className={`flex h-10 items-stretch justify-between gap-2 border-b border-neutral-800 bg-black px-2 select-none ${isDarwin ? "pl-20" : ""}`}>
				<HoverTooltip content="Go back" side="right">
					<button
						type="button"
						aria-label="Go back"
						className={cn("control-button self-center cursor-pointer", !canGoBack && "disabled")}
						disabled={!canGoBack}
						onClick={() => void goback()}
					>
						<ArrowLeftIcon />
					</button>
				</HoverTooltip>
				<div className="drag flex flex-1 items-center gap-2">
					{!isDarwin && (
						<div className="flex items-center gap-1">
							<div className="-mt-px flex-none text-xs">Sweet Spot</div>
						</div>
					)}
				</div>
				<div className="flex items-center gap-2">
					<HoverTooltip content="Player mode">
						<button
							type="button"
							className="control-button"
							aria-label="Player mode"
							disabled={playerMode.isLoading}
							onClick={() => void playerMode.mutateAsync().catch((error) => toast.error(`Could not open player mode: ${error.message}`))}
						>
							<PanelsTopLeft />
						</button>
					</HoverTooltip>
					<ToolbarOptions />
					{!isDarwin && (
						<>
							<div className="h-6 w-px bg-gray-600" />
							<div className="flex items-center gap-1">
								<HoverTooltip content="Minimize window">
									<button aria-label="Minimize window" type="button" className="control-button" onClick={() => void minimize()}>
										<Minimize2 />
									</button>
								</HoverTooltip>
								<HoverTooltip content="Maximize or restore window">
									<button aria-label="Maximize or restore window" type="button" className="control-button" onClick={() => void maximize()}>
										<MaximizeIcon />
									</button>
								</HoverTooltip>
								<HoverTooltip content="Close window">
									<button aria-label="Close window" type="button" className="control-button control-button-danger" onClick={() => void quit()}>
										<XIcon />
									</button>
								</HoverTooltip>
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
	return <TooltipProvider compact>{toolbar}</TooltipProvider>;
}
