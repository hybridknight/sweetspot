import type { PreloadSweetspotHost } from "./sweetspot-bridge";
import type exposeData from "./base";

type DomUtils = typeof exposeData.domUtils;
type Api = typeof exposeData.api;
type Ipc = typeof exposeData.ipcRenderer;

/**
 * Preload-only refs. Survive contextIsolation flip — plugins read these,
 * page world only sees `window.sweetspot` via contextBridge.
 */
export const preloadLocal: {
	sweetspot: PreloadSweetspotHost | null;
	api: Api | null;
	domUtils: DomUtils | null;
	ipcRenderer: Ipc | null;
} = {
	sweetspot: null,
	api: null,
	domUtils: null,
	ipcRenderer: null,
};

export function getSweetspot(): PreloadSweetspotHost {
	if (!preloadLocal.sweetspot) throw new Error("sweetspot bridge not ready");
	return preloadLocal.sweetspot;
}

export function getPreloadApi(): Api {
	if (!preloadLocal.api) throw new Error("preload api not ready");
	return preloadLocal.api;
}

export function getPreloadDomUtils(): DomUtils {
	if (!preloadLocal.domUtils) throw new Error("preload domUtils not ready");
	return preloadLocal.domUtils;
}
