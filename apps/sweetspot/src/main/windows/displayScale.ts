import { screen, WebContentsView, type BrowserWindow } from "electron";

/** Refresh embedded surfaces after a move between displays with different DPI. */
export function bindWindowDisplayScale(win: BrowserWindow, layout: () => void): void {
	let display = screen.getDisplayMatching(win.getBounds());
	let timer: ReturnType<typeof setTimeout> | undefined;

	const refresh = () => {
		timer = undefined;
		if (win.isDestroyed()) return;
		const next = screen.getDisplayMatching(win.getBounds());
		const changed = next.id !== display.id || next.scaleFactor !== display.scaleFactor;
		display = next;
		if (!changed) return;

		layout();
		for (const view of win.contentView.children) {
			if (!(view instanceof WebContentsView) || view.webContents.isDestroyed()) continue;
			// Bounds are in DIP. Do not multiply/divide them by the monitor's scale.
			// A real native resize refreshes the compositor's backing surface even
			// when moving displays did not change the view's logical dimensions.
			const bounds = view.getBounds();
			if (bounds.width <= 0 || bounds.height <= 0) continue;
			view.setBounds({ ...bounds, width: bounds.width + 1 });
			view.setBounds(bounds);
		}
	};
	const schedule = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = setTimeout(refresh, 100);
	};

	// display-metrics-changed covers OS scaling changes, but moving a window
	// between existing monitors only emits window movement/resize events.
	win.on("move", schedule);
	win.on("resize", schedule);
	win.on("show", schedule);
	screen.on("display-metrics-changed", schedule);
	screen.on("display-added", schedule);
	screen.on("display-removed", schedule);
	win.once("closed", () => {
		if (timer !== undefined) clearTimeout(timer);
		win.off("move", schedule);
		win.off("resize", schedule);
		win.off("show", schedule);
		screen.off("display-metrics-changed", schedule);
		screen.off("display-added", schedule);
		screen.off("display-removed", schedule);
	});
}
