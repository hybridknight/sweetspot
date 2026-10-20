import { RiFolderOpenLine, RiGithubFill, RiGlobalLine } from "@remixicon/react";
import { UPDATE_CHANNEL_LABELS, type UpdateChannel } from "@shared/utils/updater";
import { createFileRoute } from "@tanstack/react-router";
import { MacUpdateDownload } from "@/components/mac-update-download";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsSelect } from "@/components/settings-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useUpdater } from "@/hooks/use-updater";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/about")({
	component: AboutSettingsPage,
});

const CHANNEL_DESCRIPTIONS: Record<UpdateChannel, string> = {
	stable: "Official releases only. Recommended for most users.",
	beta: "Release candidates (-rc.n). Also receives newer stable builds.",
	alpha: "Early builds (-a.n). Also receives newer beta and stable builds.",
};

const CHANNEL_OPTIONS = (Object.keys(UPDATE_CHANNEL_LABELS) as UpdateChannel[]).map((value) => ({
	value,
	label: UPDATE_CHANNEL_LABELS[value],
	description: CHANNEL_DESCRIPTIONS[value],
}));

function AboutSettingsPage() {
	const appVersion = window.api.version;
	const isMacOS = window.api.platform.isMacOS;
	const { updateInfo, progress, status, checking, installing, check, install, downloadTarget, openingDownload, downloadOpened, downloadError, downloadDmg } = useUpdater();
	const { mutateAsync: openLogsFolder, isLoading: openingLogs } = trpc.app.openLogsFolder.useMutation();

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>About</CardTitle>
					<CardDescription>Your app version, updates, and project links.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="flex items-center justify-between gap-4">
						<div className="flex flex-col gap-1">
							<span className="text-xs font-medium">Version</span>
							<span className="text-xs text-muted-foreground">v{appVersion}</span>
						</div>
						{!isMacOS && status === "ready" && updateInfo ? (
							<Button variant="outline" onClick={() => void install(true)} disabled={installing}>
								Install {updateInfo.version}
								{installing ? (
									<span data-icon="inline-end">
										<Spinner />
									</span>
								) : null}
							</Button>
						) : status === "downloading" || status === "installing" ? (
							<Button variant="outline" disabled>
								{status === "installing" ? "Installing..." : `Downloading... ${(progress?.percent ?? 0).toFixed(0)}%`}
								<span data-icon="inline-end">
									<Spinner />
								</span>
							</Button>
						) : (
							<Button variant="outline" onClick={() => void check()} disabled={checking}>
								{checking ? "Checking..." : updateInfo ? `Update v${updateInfo.version}` : "Check for updates"}
								{checking ? (
									<span data-icon="inline-end">
										<Spinner />
									</span>
								) : null}
							</Button>
						)}
					</div>
					{isMacOS && updateInfo && <MacUpdateDownload
						targetLabel={downloadTarget?.label}
						opening={openingDownload}
						opened={downloadOpened}
						error={downloadError}
						onDownload={downloadDmg}
					/>}
					<nav aria-label="Sweet Spot links" className="flex flex-wrap gap-4 border-t border-border pt-4">
						{[
							{ href: "https://github.com/hybridknight/sweetspot", label: "GitHub", icon: RiGithubFill },
							{ href: "https://sweetspot.bkk.ooo", label: "Website", icon: RiGlobalLine },
						].map(({ href, label, icon: Icon }) => (
							<a
								key={href}
								href={href}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-2 rounded-md text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
							>
								<Icon className="size-4" aria-hidden="true" />
								{label}
							</a>
						))}
					</nav>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Logs</CardTitle>
					<CardDescription>Find app logs to help troubleshoot errors and warnings.</CardDescription>
				</CardHeader>
				<CardContent>
					<Button variant="outline" disabled={openingLogs} onClick={() => void openLogsFolder()}>
						<span data-icon="inline-start">
							<RiFolderOpenLine className="size-4" />
						</span>
						{openingLogs ? "Opening..." : "Open logs folder"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Update preferences</CardTitle>
					<CardDescription>Choose update checks and the releases you receive.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.autoupdate" description={isMacOS ? "Check for new versions and notify you when a DMG is available." : "Automatically check for and install app updates."}>
							{isMacOS ? "Automatic update checks" : "Automatic updates"}
						</SettingsCheckbox>
						<SettingsSelect configKey="app.channel" defaultValue="stable" label="Update channel" options={CHANNEL_OPTIONS} />
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
