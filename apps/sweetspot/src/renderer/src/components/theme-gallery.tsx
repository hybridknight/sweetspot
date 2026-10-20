import { THEME_PRESETS, type ThemePreset } from "@shared/themes/catalog";
import { Check, Code2, Pause, Play, SkipForward } from "lucide-react";
import { type CSSProperties, useId } from "react";
import "./theme-gallery.css";

export function ThemePreview({ theme }: { theme: ThemePreset }) {
	const style = {
		"--preview-bg": theme.background,
		"--preview-surface": theme.surface,
		"--preview-elevated": theme.elevated,
		"--preview-text": theme.text,
		"--preview-muted": theme.muted,
		"--preview-accent": theme.accent,
		"--preview-on-accent": theme.onAccent,
		"--preview-radius": `${theme.radius}px`,
		fontFamily: theme.font ?? (theme.id === "terminal" ? '"Courier New", monospace' : undefined),
	} as CSSProperties;
	return (
		<span className="theme-preview" style={style} data-theme={theme.id} aria-hidden="true">
			<span className="theme-preview-nav">
				<span className="theme-preview-logo" />
				<span className="theme-preview-search" />
				<span className="theme-preview-avatar" />
			</span>
			<span className="theme-preview-body">
				<span className="theme-preview-sidebar">
					<i />
					<i />
					<i />
				</span>
				<span className="theme-preview-content">
					<span className="theme-preview-heading">Your daily mix</span>
					<span className="theme-preview-albums">
						<i />
						<i />
						<i />
					</span>
					<span className="theme-preview-track">
						<i />
						<span>On repeat</span>
						<Play size={9} fill="currentColor" />
					</span>
				</span>
			</span>
			<span className="theme-preview-player">
				<span className="theme-preview-cover" />
				<span className="theme-preview-lines">
					<i />
					<i />
				</span>
				<span className="theme-preview-play">
					<Pause size={9} fill="currentColor" />
				</span>
				<SkipForward size={10} />
				<span className="theme-preview-progress" />
			</span>
		</span>
	);
}

export function ThemeGallery({ selected, onSelect, disabled }: { selected: string; onSelect: (id: string) => void; disabled?: boolean }) {
	const id = useId();
	return (
		<fieldset className="theme-gallery-fieldset" disabled={disabled} aria-describedby={`${id}-help`}>
			<legend className="text-base font-semibold">Find your atmosphere</legend>
			<p id={`${id}-help`} className="mt-1 mb-4 text-sm text-muted-foreground">
				Select a preview to apply it to YouTube Music. Use arrow keys to explore when a theme is focused.
			</p>
			<div className="theme-gallery">
				{THEME_PRESETS.map((theme) => (
					<label className="theme-option" key={theme.id}>
						<input
							className="theme-option-input"
							type="radio"
							name={`${id}-theme`}
							value={theme.id}
							checked={selected === theme.id}
							onChange={() => onSelect(theme.id)}
							aria-labelledby={`${id}-${theme.id}-name`}
							aria-describedby={`${id}-${theme.id}-description`}
						/>
						<span className="theme-option-card">
							<ThemePreview theme={theme} />
							<span className="theme-option-details">
								<span className="theme-option-title">
									<span id={`${id}-${theme.id}-name`}>{theme.name}</span>
									<span className="theme-option-indicator">{selected === theme.id ? <Check size={12} strokeWidth={3} /> : null}</span>
								</span>
								<span className="theme-option-style">
									{theme.style}
									{selected === theme.id ? " · Selected" : ""}
								</span>
								<span className="theme-option-description" id={`${id}-${theme.id}-description`}>
									{theme.description}
								</span>
							</span>
						</span>
					</label>
				))}
				<label className="theme-option">
					<input
						className="theme-option-input"
						type="radio"
						name={`${id}-theme`}
						value="custom"
						checked={selected === "custom"}
						onChange={() => onSelect("custom")}
						aria-labelledby={`${id}-custom-name`}
						aria-describedby={`${id}-custom-description`}
					/>
					<span className="theme-option-card theme-option-custom">
						<span className="theme-custom-preview" aria-hidden="true">
							<Code2 size={30} strokeWidth={1.5} />
							<span>Make it yours</span>
						</span>
						<span className="theme-option-details">
							<span className="theme-option-title">
								<span id={`${id}-custom-name`}>Custom file</span>
								<span className="theme-option-indicator">{selected === "custom" ? <Check size={12} strokeWidth={3} /> : null}</span>
							</span>
							<span className="theme-option-style">Your own style{selected === "custom" ? " · Selected" : ""}</span>
							<span className="theme-option-description" id={`${id}-custom-description`}>
								Bring your own CSS, SCSS, or Sass. Choose a file below after selecting this card.
							</span>
						</span>
					</span>
				</label>
			</div>
		</fieldset>
	);
}
