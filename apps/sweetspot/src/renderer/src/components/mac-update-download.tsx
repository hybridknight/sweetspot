import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
