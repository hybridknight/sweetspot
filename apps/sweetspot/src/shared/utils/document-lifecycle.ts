/**
 * beforeunload is only a request to leave: YouTube can cancel it while music
 * plays. Keep audio processing and command listeners alive until departure.
 * A cached page also keeps its listeners because it can be restored.
 */
export function onDocumentDiscarded(cleanup: () => void): void {
	const onPageHide = (event: PageTransitionEvent) => {
		if (event.persisted) return;
		window.removeEventListener("pagehide", onPageHide);
		cleanup();
	};
	window.addEventListener("pagehide", onPageHide);
}
