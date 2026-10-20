import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/_settings/advanced")({ component: AdvancedSettingsPage });
function AdvancedSettingsPage() {
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Graphics</CardTitle>
					<CardDescription>Change rendering behavior if you experience graphics issues.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						{" "}
						<SettingsCheckbox configKey="app.disableHardwareAccel" description="Requires an app restart to apply.">
							Disable hardware acceleration
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Developer
						<Badge variant="destructive">Caution</Badge>
					</CardTitle>
					<CardDescription>Advanced tools for debugging. Do not paste unknown scripts into the console.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.enableDev" description="Enables developer tools for testing additional functionality.">
							Developer mode
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
