import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";

export const Route = createFileRoute("/_settings/player/controls")({
	component: ControlsSettingsPage,
});
function ControlsSettingsPage() {
	const isMac = window.app.platform === "darwin";
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Keyboard shortcuts</CardTitle>
					<CardDescription>Control playback while using other apps. Native media keys remain available.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="player.globalShortcutsEnabled"
							defaultValue={!isMac}
							description={
								isMac
									? "Option+Shift+Left/Right changes tracks; Option+Shift+Space plays or pauses. Enabling this overrides word selection in other apps. Applies immediately."
									: "Alt+Shift+Left/Right changes tracks; Alt+Shift+Space plays or pauses. Applies immediately."
							}
						>
							Global playback shortcuts
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Playback indicators</CardTitle>
					<CardDescription>See playback progress outside the player.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						{" "}
						<SettingsCheckbox configKey="app.enableTaskbarProgress" description="Show playback progress on the taskbar.">
							Show taskbar progress
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
