import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";

export function MacUpdateDownload(props: {
	targetLabel?: string;
	opening: boolean;
	opened?: "dmg" | "release";
	error?: string;
	onDownload: () => void;
	onLater?: () => void;
}) {
	return (
		<div className="space-y-3 text-left">
			<div className="space-y-1">
				<p className="text-xs font-medium">Update using the DMG</p>
				<ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
					<li>Download and open the DMG.</li>
					<li>Quit Sweet Spot.</li>
					<li>Drag Sweet Spot into Applications and choose Replace.</li>
				</ol>
				<p className="text-xs text-muted-foreground">Your settings are kept.</p>
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

			{props.error && <p role="alert" className="text-xs text-destructive">{props.error} Try again.</p>}
			<Button variant="accent" className="w-full" size="xl" disabled={props.opening} onClick={props.onDownload}>
				{props.opening ? <Spinner size="sm" /> : <DownloadIcon />}
				{props.opening ? "Opening download…" : "Download DMG"}
			</Button>
			<p role="status" className="text-center text-xs text-muted-foreground">
				{props.opened === "dmg" ? "Download opened in your browser." : props.opened === "release"
					? `Release page opened. Choose the ${props.targetLabel ?? "matching"} DMG.`
					: `For ${props.targetLabel ?? "your Mac"} · Browser download`}
			</p>
			{props.onLater && <Button variant="outline" className="w-full" onClick={props.onLater}>Later</Button>}
		</div>
	);
}
