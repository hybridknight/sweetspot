/** Palette tokens are shared by the injected styles and the settings previews. */
export interface ThemePreset {
	id: string;
	name: string;
	style: string;
	description: string;
	background: string;
	surface: string;
	elevated: string;
	text: string;
	muted: string;
	accent: string;
	onAccent: string;
	radius: number;
	font?: string;
	light?: boolean;
}

export const THEME_PRESETS: readonly ThemePreset[] = [
	{
		id: "default",
		name: "Original",
		style: "Classic dark",
		description: "Familiar charcoal, clean white controls, and softly rounded artwork.",
		background: "#09090b",
		surface: "#161619",
		elevated: "#27272d",
		text: "#fafafa",
		muted: "#b5b5c0",
		accent: "#ffffff",
		onAccent: "#111114",
		radius: 8,
	},
	{
		id: "mnml",
		name: "MNML",
		style: "Quiet monochrome",
		description: "White space, black pill controls, and crisp Inter type. Inspired by Digital Minimalist.",
		background: "#ffffff",
		surface: "#fafafa",
		elevated: "#ededed",
		text: "#000000",
		muted: "#545454",
		accent: "#000000",
		onAccent: "#ffffff",
		radius: 10,
		font: '"Inter Variable", Arial, sans-serif',
		light: true,
	},
	{
		id: "midnight",
		name: "Midnight",
		style: "Deep blue",
		description: "Inky navy with crisp blue highlights for late-night listening.",
		background: "#080e20",
		surface: "#111d35",
		elevated: "#20304d",
		text: "#eef4ff",
		muted: "#a8bad8",
		accent: "#8bbcff",
		onAccent: "#08172b",
		radius: 12,
	},
	{
		id: "aurora",
		name: "Aurora",
		style: "Cool & spacious",
		description: "Northern green and teal with generous, rounded surfaces.",
		background: "#081b1b",
		surface: "#112d2c",
		elevated: "#20413d",
		text: "#ebfff8",
		muted: "#a6c9c0",
		accent: "#7de8c2",
		onAccent: "#08261e",
		radius: 18,
	},
	{
		id: "rose",
		name: "Rose",
		style: "Soft & warm",
		description: "Dusty rose highlights on plum for a cozy, mellow atmosphere.",
		background: "#21131c",
		surface: "#34202e",
		elevated: "#4c3042",
		text: "#fff0f7",
		muted: "#d1aaba",
		accent: "#ffafca",
		onAccent: "#351224",
		radius: 16,
	},
	{
		id: "sunset",
		name: "Sunset",
		style: "Warm amber",
		description: "Burnt umber and golden peach, inspired by the golden hour.",
		background: "#21140e",
		surface: "#362319",
		elevated: "#513726",
		text: "#fff4e8",
		muted: "#d2b59c",
		accent: "#ffbc80",
		onAccent: "#351b08",
		radius: 12,
	},
	{
		id: "paper",
		name: "Paper",
		style: "Light & minimal",
		description: "Bright ivory, dark ink, and restrained blue for daytime listening.",
		background: "#f7f5ef",
		surface: "#ffffff",
		elevated: "#e8e5dd",
		text: "#252824",
		muted: "#5d625c",
		accent: "#2459ac",
		onAccent: "#ffffff",
		radius: 6,
		light: true,
	},
	{
		id: "latte",
		name: "Latte",
		style: "Warm light",
		description: "Creamy surfaces and espresso tones with a soft, tactile feel.",
		background: "#f3e9da",
		surface: "#fff8ee",
		elevated: "#e5d6c2",
		text: "#39291f",
		muted: "#705844",
		accent: "#874322",
		onAccent: "#fff8ee",
		radius: 18,
		light: true,
	},
	{
		id: "neon",
		name: "Neon",
		style: "Electric violet",
		description: "Vivid lilac on near-black with sharp corners and club energy.",
		background: "#100b1b",
		surface: "#20152f",
		elevated: "#362446",
		text: "#faf0ff",
		muted: "#c2abd4",
		accent: "#d5a0ff",
		onAccent: "#251034",
		radius: 4,
	},
	{
		id: "terminal",
		name: "Terminal",
		style: "Retro green",
		description: "Phosphor green, deep forest black, and square-edged artwork.",
		background: "#08110b",
		surface: "#101f15",
		elevated: "#203826",
		text: "#ddffe2",
		muted: "#9ac5a2",
		accent: "#88ef9b",
		onAccent: "#0b2612",
		radius: 0,
	},

];

export type BuiltinThemeId = "default" | "midnight" | "aurora" | "rose" | "sunset" | "paper" | "mnml" | "latte" | "neon" | "terminal";
