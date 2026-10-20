import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { SettingsSelect } from "@/components/settings-select";
import { Badge } from "@/components/ui/badge";
export const Route = createFileRoute("/_settings/sharing")({ component: SharingSettingsPage });
function SharingSettingsPage() {
	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Shared links</CardTitle>
					<CardDescription>Choose how shared songs open in Sweet Spot.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsSelect
							configKey="player.deepLinkOpen"
							defaultValue="ask"
							label="When opening a shared link"
							description="Ask before playing a shared song, or start it immediately."
							options={[
								{
									value: "ask",
									label: "Ask first",
									description: "Choose play now, add to queue, or cancel",
								},
								{
									value: "play",
									label: "Play immediately",
									description: "Start the track without a confirmation dialog",
								},
							]}
						/>
						<SettingsCheckbox configKey="player.replaceShareLinks" defaultValue={true} description="Use ssytm:// links when sharing songs so they open in Sweet Spot.">
							Share links that open Sweet Spot
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Cast to a device</CardTitle>
					<CardDescription>Connect to Chromecast devices on your local network.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox
							configKey="player.chromecastEnabled"
							description={
								<span className="inline-flex items-center gap-2">
									Show Cast in YouTube Music to discover nearby devices. Restart required. Your firewall must allow device discovery (mDNS).
									<Badge variant="outline">Experimental</Badge>
								</span>
							}
						>
							Chromecast discovery
						</SettingsCheckbox>
					</FieldGroup>
				</CardContent>
			</Card>
		</>
	);
}
