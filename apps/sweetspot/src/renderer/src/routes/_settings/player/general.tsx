import { PlaybackTransitionSettings } from "@/components/playback-transition-settings";
import { ConsistentVolumeSetting } from "@/components/consistent-volume-setting";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsSelect } from "@/components/settings-select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/player/general")({
	component: PlayerGeneralSettingsPage,
});

function PlayerGeneralSettingsPage() {
	const [resEnabled, , { isPending: resPending }] = useSettingsState("player.res.enabled", false);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Audio & transitions</CardTitle>
					<CardDescription>Adjust volume, song transitions, and automatic skipping.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<ConsistentVolumeSetting />
						<PlaybackTransitionSettings />
						<SettingsCheckbox
							configKey="player.skipDisliked"
							description={
								<span className="inline-flex items-center gap-2">
									Automatically skip tracks you disliked.
									<Badge variant="outline">Experimental</Badge>
								</span>
							}
						>
							Skip disliked songs
						</SettingsCheckbox>
						<SettingsCheckbox configKey="volumeRatio.enabled" description="Use an exponential volume curve for finer control than the default linear slider.">
							Fine volume control
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Video</CardTitle>
					<CardDescription>Preferred resolution when available.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="player.res.enabled">Choose video resolution</SettingsCheckbox>
						{resEnabled && !resPending && (
							<SettingsSelect
								configKey="player.res.prefer"
								label="Preferred video resolution"
								options={[
									{ value: "hd2160", label: "2160P UHD / 4K" },
									{ value: "hd1440", label: "1440P QHD" },
									{ value: "hd1080", label: "1080P FHD" },
									{ value: "hd720", label: "720P HD" },
									{ value: "auto", label: "Default" },
								]}
							/>
						)}
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
