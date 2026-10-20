import DevIcon from "@/assets/icons/chip.svg?react";
import HomeIcon from "@/assets/icons/home.svg?react";
import { HoverTooltip } from "@/components/ui/tooltip";
import { useNavigation } from "@/hooks/use-navigation";
import { useSettingsState } from "@/hooks/use-settings";
import { useUpdater } from "@/hooks/use-updater";
import { trpc } from "@/lib/trpc";

export function ToolbarOptions() {
	const { isHome, home, devTools } = useNavigation();
	const { updateInfo, downloaded } = useUpdater();
	const settingsLabel = updateInfo
		? downloaded ? "Settings · Update ready to install" : "Settings · Update available"
		: "Settings";
	const settingsHint = updateInfo
		? downloaded ? "Update ready · Install in About" : "Update available · See About"
		: "Settings";
	const [isDev] = useSettingsState<boolean>("app.enableDev", false);
	const { mutateAsync: openWindow } = trpc.app.openWindow.useMutation();

	return (
		<div className="flex flex-row items-center gap-2">
			{!isHome && (
				<HoverTooltip content="Home">
					<button aria-label="Home" type="button" className="control-button relative size-4" onClick={() => void home()}>
						<HomeIcon />
					</button>
				</HoverTooltip>
			)}
			{isDev && (
				<HoverTooltip content="Developer tools">
					<button aria-label="Developer tools" type="button" className="control-button relative size-4" onClick={() => void devTools()}>
						<DevIcon />
					</button>
				</HoverTooltip>
			)}

			<HoverTooltip content={
				<>
					{updateInfo && <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-green-500" />}
					{settingsHint}
				</>
			}>
				<button aria-label={settingsLabel} type="button" className="control-button relative" onClick={() => void openWindow("settingsWindow")}>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
						<path
							fillRule="evenodd"
							d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
							clipRule="evenodd"
						/>
					</svg>
					{updateInfo && (
						<span aria-hidden="true" className="pointer-events-none absolute top-0.5 right-0.5 size-1.5 rounded-full bg-green-500 ring-2 ring-black" />
					)}
				</button>
			</HoverTooltip>
		</div>
	);
}
