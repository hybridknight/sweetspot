import {
	forceUpdateVolume,
	volumeRatioPage,
} from "./volume-ratio.page";
import { disableVolumeRatio, enableVolumeRatio } from "./resources/volume-ratio/patch";
import type { RendererPluginRegistration } from "./world0/types";

const SETTING_KEY = "volumeRatio.enabled";
const CAST_SESSION_EVENT = "sweetspot-cast-session";

function isCastSessionActive(): boolean {
	return (window as Window & { __sweetspotCastConnected?: boolean }).__sweetspotCastConnected === true;
}

function applyEnabled(userEnabled: boolean, castConnected = isCastSessionActive()): void {
	if (userEnabled && !castConnected) enableVolumeRatio();
	else disableVolumeRatio();
	forceUpdateVolume();
}

/**
 * Page-world: exponential volume patch + playerApi.setVolume bridge.
 */
const volumeRatioRenderer: RendererPluginRegistration = {
	id: "volume-ratio",
	enabled: true,
	async start(ctx) {
		let userEnabled = false;
		const offBridge = volumeRatioPage.listen(ctx.log);

		const onCastSession = (ev: Event) => {
			const connected = (ev as CustomEvent<{ connected?: boolean }>).detail?.connected === true;
			applyEnabled(userEnabled, connected);
		};
		window.addEventListener(CAST_SESSION_EVENT, onCastSession);

		const offSettings = ctx.sweetspot?.on("settingsProvider.change", (key, value) => {
			if (key === SETTING_KEY) {
				userEnabled = value === true;
				applyEnabled(userEnabled);
				return;
			}
			if (key === "volumeRatio" && value && typeof value === "object") {
				userEnabled = (value as { enabled?: boolean }).enabled === true;
				applyEnabled(userEnabled);
			}
		});

		try {
			const v = await ctx.sweetspot?.settings.get(SETTING_KEY);
			userEnabled = v === true;
			applyEnabled(userEnabled);
		} catch {
			/* ignore */
		}

		return () => {
			window.removeEventListener(CAST_SESSION_EVENT, onCastSession);
			offBridge();
			offSettings?.();
			disableVolumeRatio();
		};
	},
	onPlayerApiReady(playerApi, ctx) {
		void ctx.sweetspot?.settings.get(SETTING_KEY).then((v) => {
			if (v !== true) return;
			try {
				applyEnabled(true);
				playerApi.setVolume(playerApi.getVolume());
			} catch {
				/* ignore */
			}
		});
	},
};

export default volumeRatioRenderer;
