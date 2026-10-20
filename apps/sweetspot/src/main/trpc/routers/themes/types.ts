import type { BuiltinThemeId } from "@shared/themes/catalog";

export interface ThemesConfig {
	enabled: boolean;
	/** Builtin theme id or "custom" */
	selected: BuiltinThemeId | "custom";
	customFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
	/** Glass / backdrop blur chrome (player page, bar, dialogs, thumbnail soften). */
	blur?: boolean;
}

/** Legacy settings shape (pre-themes migration). */
export interface LegacyCustomCssConfig {
	enabled: boolean;
	scssFile: string | null;
	watching: boolean;
	thumbnailBackground?: boolean;
}
