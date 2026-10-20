/** Task-based destinations shared by navigation, search, and page headings.
 * Keep existing URLs stable so player menus and external entry points still work.
 */
export const settingsGroups = [
	{
		label: "Application",
		pages: [
			{
				to: "/",
				label: "General",
				icon: "settings",
				description: "Choose how Sweet Spot starts and behaves when you close it.",
				keywords: "startup autostart sign-in minimized window system tray close quit",
			},
			{
				to: "/appearance/themes",
				label: "Themes",
				icon: "code",
				description: "Personalize YouTube Music with themes and custom styles.",
				keywords: "appearance theme thumbnail background glass blur performance custom css file watching",
			},
			{
				to: "/appearance/skins",
				label: "Player skins",
				icon: "palette",
				description: "Choose a player layout and customize its appearance.",
				keywords: "appearance skin layout spotlight pop artwork background colors spectrum visualizer",
			},
			{
				to: "/appearance/display",
				label: "Display & zoom",
				icon: "display",
				description: "Adjust the size of the YouTube Music view.",
				keywords: "appearance display zoom scale resolution text size accessibility",
			},
		],
	},
	{
		label: "Listening",
		pages: [
			{
				to: "/player/general",
				label: "Playback",
				icon: "music",
				description: "Adjust audio, song transitions, and video quality.",
				keywords: "volume normalization consistent loudness fade crossfade gapless transitions skip disliked songs exponential ratio video resolution quality 4k",
			},
			{
				to: "/player/equalizer",
				label: "Equalizer",
				icon: "music",
				description: "Shape your sound with audio presets and frequency controls.",
				keywords: "audio sound equalizer eq bass treble frequency gain preamp presets",
			},
			{
				to: "/player/lyrics",
				label: "Lyrics",
				icon: "lyrics",
				description: "Choose synced lyrics, highlighting, and lyric providers.",
				keywords:
					"lyrics timed word syllable sync auto open tab approximate matches timestamps time codes line background highlight text fill progress bar providers order better lyrics api key unison lrclib captions",
			},
			{
				to: "/player/controls",
				label: "Shortcuts & controls",
				icon: "settings",
				description: "Control playback from your keyboard and show playback indicators.",
				keywords: "keyboard global shortcuts media keys alt option shift space taskbar progress",
			},
		],
	},
	{
		label: "Connections",
		pages: [
			{
				to: "/sharing",
				label: "Sharing & casting",
				icon: "cast",
				description: "Open shared songs in Sweet Spot and discover Chromecast devices.",
				keywords: "shared links share urls ssytm deep link play immediately ask queue replace chromecast cast device network mdns",
			},
			{
				to: "/api-integrations/mcp",
				label: "AI & MCP",
				icon: "server",
				description: "Connect an AI assistant to your music player.",
				keywords: "mcp model context protocol ai assistant agent tools queue playback connection",
			},
			{
				to: "/api-integrations/api",
				label: "Local API",
				icon: "server",
				description: "Connect other apps using the local HTTP server.",
				keywords: "api local server http port developer integration",
			},
			{
				to: "/api-integrations/authentication",
				label: "Access & pairing",
				icon: "key",
				description: "Manage API authentication and paired clients.",
				keywords: "security authentication auth authorize access tokens pairing paired clients revoke password",
			},
		],
	},
	{
		label: "System",
		pages: [
			{
				to: "/advanced",
				label: "Advanced",
				icon: "code",
				description: "Troubleshoot graphics and enable developer tools.",
				keywords: "hardware acceleration graphics rendering restart developer mode debug console devtools",
			},
			{
				to: "/about",
				label: "About & updates",
				icon: "info",
				description: "Check your version, manage updates, and find app logs.",
				keywords: "version update automatic autoupdate install release channel stable beta alpha logs folder support github website links",
			},
		],
	},
] as const;

export const settingsPages = settingsGroups.flatMap((group) => group.pages.map((page) => ({ ...page, group: group.label })));
export type SettingsPage = (typeof settingsPages)[number];
export type SettingsDestination = SettingsPage["to"];

export function searchSettings(query: string): SettingsPage[] {
	const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
	return settingsPages.filter((page) => {
		const text = `${page.label} ${page.description} ${page.group} ${page.keywords}`.toLocaleLowerCase();
		return terms.every((term) => text.includes(term));
	});
}
