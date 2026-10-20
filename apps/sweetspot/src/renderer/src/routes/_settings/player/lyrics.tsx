import { createFileRoute } from "@tanstack/react-router";
import { LyricsProvidersOrder } from "@/components/lyrics-providers-order";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsInput } from "@/components/settings-input";
import { SettingsSelect, type SettingsSelectOption } from "@/components/settings-select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";

export const Route = createFileRoute("/_settings/player/lyrics")({
	component: LyricsSettingsPage,
});

const LINE_STYLE_OPTIONS: SettingsSelectOption[] = [
	{
		value: "highlight",
		label: "Highlight only",
		description: "Highlight the current line or word without an additional progress indicator.",
	},
	{
		value: "fill",
		label: "Text fill",
		description: "Fill each word as it is sung. Lyrics with line timing use a simple highlight instead.",
	},
	{
		value: "bar",
		label: "Progress bar",
		description: "Show a steady progress bar behind each line.",
	},
];

function LyricsSettingsPage() {
	const [lyricsEnabled] = useSettingsState<boolean>("lyrics.enabled", false);

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle>Lyrics</CardTitle>
					<CardDescription>Show timed lyrics in the YouTube Music Lyrics tab. Word and syllable timing depend on the selected provider.</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<SettingsCheckbox configKey="lyrics.enabled" description="When enabled, open the Lyrics tab in the player to see synced lines. Click a line or word to seek.">
							Enable lyrics
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.autoOpenTab"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Open Lyrics once when a new song has lyrics. You can switch to another tab afterward."
						>
							Open the Lyrics tab automatically
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.preferWordSync"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Check more providers for word or syllable timing before using line timing. This may require extra requests."
						>
							Prefer word-synced sources
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.showEvenIfInexact"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Allow LRCLib lyrics when the song title and artist are similar but not an exact match."
						>
							Allow approximate matches
						</SettingsCheckbox>
						<SettingsCheckbox configKey="lyrics.showTimeCodes" disabled={!lyricsEnabled} description="Show a timestamp before each line.">
							Show timestamps
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="lyrics.lineBackground"
							defaultValue={true}
							disabled={!lyricsEnabled}
							description="Tint the row behind the current line. Turn off to brighten the text only. The Progress bar style still draws its bar."
						>
							Active line background
						</SettingsCheckbox>
						<SettingsSelect
							configKey="lyrics.lineStyle"
							defaultValue="fill"
							disabled={!lyricsEnabled}
							label="Highlight style"
							description="Text fill requires word or syllable timing. Lyrics with line timing use a simple highlight or a steady progress bar."
							options={LINE_STYLE_OPTIONS}
						/>
					</FieldGroup>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Providers</CardTitle>
					<CardDescription>
						Try providers in order until lyrics are found. Better Lyrics and Unison support syllable timing; LRCLib and YouTube captions provide line timing when available. Toggle
						sources or drag to reorder.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<FieldGroup>
						<LyricsProvidersOrder disabled={!lyricsEnabled} />
						<SettingsInput
							configKey="lyrics.betterLyricsApiKey"
							type="password"
							autoComplete="off"
							spellCheck={false}
							disabled={!lyricsEnabled}
							placeholder="Optional"
							label="Better Lyrics API key"
							hint={
								<>
									Sent as <code>X-API-Key</code>. Cached songs never need a key; uncached songs do, and Better Lyrics is not issuing new keys right now. Without one, play a song
									once in the Better Lyrics browser extension to cache it.
								</>
							}
						/>
					</FieldGroup>
				</CardContent>
				<CardFooter>
					<p className="text-xs text-muted-foreground">Site links open each provider&apos;s homepage or docs.</p>
				</CardFooter>
			</Card>
		</>
	);
}
