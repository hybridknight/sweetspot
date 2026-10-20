import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/")({
	component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
	const [getStartedEnabled, setGetStartedEnabled, { isPending: getStartedPending }] = useSettingsState("app.getstarted", false);
	const [appAutostartEnabled, , { isPending: autostartPending }] = useSettingsState("app.autostart", false);

	return (
		<>
			{getStartedEnabled && (
				<Card>
					<CardHeader>
						<CardTitle>Get started</CardTitle>
						<CardDescription>Welcome to Sweet Spot. Adjust settings and personalize your experience.</CardDescription>
					</CardHeader>
					<CardFooter className="justify-between gap-2">
						<a href="https://sweetspot.bkk.ooo" target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-4 hover:underline">
							Learn more
						</a>
						<Button variant="ghost" size="sm" disabled={getStartedPending} onClick={() => setGetStartedEnabled(false)}>
							Don't show again
						</Button>
					</CardFooter>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Startup & window</CardTitle>
					<CardDescription>Startup and system behavior.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="app.autostart" description="Open Sweet Spot automatically when you sign in to your computer.">
							Launch at sign-in
						</SettingsCheckbox>
						{appAutostartEnabled && !autostartPending && <SettingsCheckbox configKey="app.autostartMinimized">Start minimized</SettingsCheckbox>}
						<SettingsCheckbox configKey="app.minimizeTrayOverride" description="Keep music playing in the system tray when you close the window.">
							Keep running when the window closes
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
