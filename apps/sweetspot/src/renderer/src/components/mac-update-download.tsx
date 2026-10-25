import { DownloadIcon, PowerIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

export function MacUpdateDownload(props: {
	targetLabel?: string;
	opening: boolean;
	opened?: "dmg" | "release";
	error?: string;
	onDownload: () => void;
	onQuit: () => void;
	onLater?: () => void;
}) {
	const [quitting, setQuitting] = useState(false);
	const downloadOpened = !!props.opened;

	return (
		<div className="flex flex-col gap-4 text-left">
			{!downloadOpened && (
				<div className="space-y-2">
					<p className="text-xs font-medium">Update using the DMG</p>
					<ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
						<li>Download and open the DMG.</li>
						<li>Quit Sweet Spot.</li>
						<li>Drag Sweet Spot into Applications and choose Replace.</li>
					</ol>
					<p className="text-xs text-muted-foreground">Your settings are kept.</p>
				</div>
			)}

			{props.error && <p role="alert" className="text-xs text-destructive">{props.error} Try again.</p>}
			{downloadOpened && (
				<div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
					<div className="space-y-2">
						<p className="text-xs font-medium">DMG finished downloading?</p>
						<p className="text-xs leading-relaxed text-muted-foreground">Open the DMG, then quit. Drag Sweet Spot into Applications and choose Replace.</p>
					</div>
					<Button variant="accent" className="w-full" size="xl" disabled={quitting} onClick={() => {
						setQuitting(true);
						props.onQuit();
					}}>
						{quitting ? <Spinner size="sm" /> : <PowerIcon />}
						{quitting ? "Quitting…" : "Quit Sweet Spot"}
					</Button>
					<p role="status" className="text-xs text-muted-foreground">{quitting ? "Closing Sweet Spot…" : "Fully quits the app. Your settings are kept."}</p>
				</div>
			)}
			<div className="space-y-2">
				<Button variant={downloadOpened ? "outline" : "accent"} className="w-full" size="xl" disabled={props.opening || quitting} onClick={props.onDownload}>
					{props.opening ? <Spinner size="sm" /> : <DownloadIcon />}
					{props.opening ? "Opening download…" : "Download DMG"}
				</Button>
				<p role="status" className="text-center text-xs text-muted-foreground">
					{props.opened === "dmg" ? "Download opened in your browser." : props.opened === "release"
						? `Release page opened. Choose the ${props.targetLabel ?? "matching"} DMG.`
						: `For ${props.targetLabel ?? "your Mac"} · Browser download`}
				</p>
			</div>
			{props.onLater && <Button variant={downloadOpened ? "ghost" : "outline"} className="w-full" disabled={quitting} onClick={props.onLater}>{downloadOpened ? "Keep listening for now" : "Later"}</Button>}
			<div className="text-center">
				<Popover>
					<PopoverTrigger className="text-xs text-primary underline underline-offset-2">macOS blocked the app?</PopoverTrigger>
					<PopoverContent side="right" align="end" className="w-80 max-w-[calc(100vw-2rem)] rounded-lg p-4">
						<PopoverTitle>Allow Sweet Spot to open</PopoverTitle>
						<p className="text-xs leading-relaxed text-muted-foreground">This release isn’t notarized by Apple. Follow these steps only for a download you trust from Sweet Spot’s official website or GitHub release.</p>
						<ol className="list-decimal space-y-2 pl-4 text-xs leading-relaxed">
							<li>Open Sweet Spot. If macOS says Apple could not verify it, click <strong>Done</strong>.</li>
							<li>Go to <strong>System Settings → Privacy &amp; Security</strong>.</li>
							<li>Scroll down and choose <strong>Open Anyway</strong> for Sweet Spot.</li>
							<li>Authenticate if asked, then choose <strong>Open</strong>.</li>
						</ol>
					</PopoverContent>
				</Popover>
			</div>
		</div>
	);
}
