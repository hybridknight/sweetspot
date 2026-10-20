import { THEME_PRESETS } from "@shared/themes/catalog";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsInput } from "@/components/settings-input";
import { ThemeGallery } from "@/components/theme-gallery";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { useSettingsState } from "@/hooks/use-settings";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/appearance/themes")({
	component: ThemesSettingsPage,
});

function ThemesSettingsPage() {
	const [enabled, , { isPending: enabledPending }] = useSettingsState("themes.enabled", true);
	const [selected, setSelected, { isPending: selectedPending, isSaving }] = useSettingsState("themes.selected", "default", { debounce: 200 });
	const [customFile, , { isPending: pathPending }] = useSettingsState("themes.customFile", "");
	const { mutateAsync: reload } = trpc.themes.reload.useMutation();
	const { mutateAsync: openFile } = trpc.app.openFile.useMutation();

	const isCustom = selected === "custom";

	return (
		<Card>
			<CardHeader>
				<CardTitle>Themes</CardTitle>
				<CardDescription>Set the mood for your music. Compare {THEME_PRESETS.length} built-in looks, or create your own.</CardDescription>
			</CardHeader>
			<CardContent>
				<FieldGroup>
					<SettingsCheckbox
						configKey="themes.enabled"
						defaultValue={true}
						description="Apply the selected style to YouTube Music. Turn off to restore its original appearance; your selection is remembered."
					>
						Enable themes
					</SettingsCheckbox>
					<p className="text-sm text-muted-foreground" role="status" aria-live="polite">
						{enabledPending || selectedPending
							? "Loading your theme…"
							: !enabled
								? "Themes are off. Enable themes to apply a preview below."
								: isSaving
									? "Saving theme…"
									: `${selected === "custom" ? "Custom file" : (THEME_PRESETS.find((theme) => theme.id === selected)?.name ?? "Unknown theme")} selected. Changes apply automatically within a moment.`}
					</p>
					<ThemeGallery selected={selected} onSelect={setSelected} disabled={!enabled || enabledPending || selectedPending} />
					<p className="text-xs text-muted-foreground">
						Previews illustrate colors and shapes. Album artwork and YouTube Music updates can change the final appearance. These themes style the music view; use Player skins for
						the separate player window.
					</p>
					<div className="border-t pt-5">
						<h3 className="mb-3 text-sm font-semibold">Background & effects</h3>
						<SettingsCheckbox
							configKey="themes.thumbnailBackground"
							defaultValue={true}
							description="Place the current song’s artwork behind the player view. Turn off for a more consistent theme palette."
						>
							Use artwork as the background
						</SettingsCheckbox>
						<SettingsCheckbox
							configKey="themes.blur"
							defaultValue={true}
							description="Soften the player background and add glass effects to menus. Turn off if scrolling feels slow. These effects can also be used with themes off."
						>
							Blur backgrounds
						</SettingsCheckbox>
					</div>
					{enabled && !enabledPending && (
						<>
							{isCustom && !selectedPending && (
								<>
									<div className="border-t pt-5 text-sm text-muted-foreground">
										Start with the generated file, or choose your own below. Open the file to edit its styles, then save it. Enable automatic reload to see your edits without using
										Reload.
									</div>
									<SettingsCheckbox configKey="themes.watching" description="Apply changes automatically when you save the theme file.">
										Reload when the file changes
									</SettingsCheckbox>
									<SettingsInput
										configKey="themes.customFile"
										type="file"
										accept=".scss,.sass,.css"
										label="Custom theme file"
										hint={
											<div className="mt-2 flex justify-end gap-2">
												<Button type="button" size="sm" variant="outline" disabled={pathPending} onClick={() => void reload()}>
													Reload styles
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													disabled={pathPending || !customFile}
													onClick={() => {
														if (customFile) void openFile(customFile);
													}}
												>
													Open file
												</Button>
											</div>
										}
									/>
								</>
							)}
							{!isCustom && (
								<div className="flex justify-end">
									<Button type="button" size="sm" variant="outline" onClick={() => void reload()}>
										Reload styles
									</Button>
								</div>
							)}
						</>
					)}
				</FieldGroup>
			</CardContent>
		</Card>
	);
}
