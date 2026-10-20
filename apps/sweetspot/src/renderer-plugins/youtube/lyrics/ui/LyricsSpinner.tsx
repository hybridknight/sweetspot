export function LyricsSpinner({ label = "Loading lyrics…" }: { label?: string }) {
	return (
		<div className="sweetspot-lyrics-status sweetspot-lyrics-loading" role="status" aria-live="polite" aria-label={label}>
			<span className="sweetspot-lyrics-spinner" aria-hidden>
				{Array.from({ length: 12 }, (_, i) => (
					<span key={i} className="sweetspot-lyrics-spinner-blade" style={{ ["--i" as string]: i }} />
				))}
			</span>
			<span className="sweetspot-lyrics-loading-label">{label}</span>
		</div>
	);
}
