import { isChromecastEnabledFromArgv } from "@shared/chromecast/flag";
import { logger } from "@shared/utils/console";
import { contextBridge, webFrame } from "electron";
import pkg from "../../package.json";
import exposeData, { assignPreload, exposeToPage, settingsProvider } from "./base";
import { preloadLocal } from "./preload-local";
import { createContextExposer, createDomUtils, createInitializationUtils, createPreloadLogger, isYoutubeMusicHost } from "./utils";
import { SWEETSPOT_AGENT_SOURCE } from "./sweetspot-agent";
import { createSweetspotBridge } from "./sweetspot-bridge";

const appVersion = pkg.version;

const log = createPreloadLogger("SWEETSPOT");
const contextExposer = createContextExposer();
const domUtils = createDomUtils();
const initUtils = createInitializationUtils();

const sweetspot = createSweetspotBridge(settingsProvider);
preloadLocal.sweetspot = sweetspot;
preloadLocal.api = exposeData.api;
preloadLocal.domUtils = exposeData.domUtils;
preloadLocal.ipcRenderer = exposeData.ipcRenderer;

// Preload-local globals for plugin host (never bridged when isolated).
assignPreload("appVersion", appVersion);
assignPreload("api", exposeData.api);
assignPreload("domUtils", exposeData.domUtils);
assignPreload("ipcRenderer", exposeData.ipcRenderer);
assignPreload("app", exposeData.app);
assignPreload("translations", exposeData.translations);
assignPreload("sweetspot", sweetspot);

// Page-visible surface: sweetspot only under isolation.
const pageSweetspot = {
	emit: sweetspot.emit.bind(sweetspot),
	on: sweetspot.on.bind(sweetspot),
	settings: sweetspot.settings,
};
if (process.contextIsolated) {
	contextBridge.exposeInMainWorld("sweetspot", pageSweetspot);
} else {
	// Dual-mode shim period: keep fat page APIs until isolation flip.
	contextExposer.exposeAll(exposeData);
	exposeToPage("sweetspot", pageSweetspot);
}

domUtils.setupTrustedTypes();

async function injectSweetspotAgent(): Promise<void> {
	const frame = webFrame as typeof webFrame & {
		executeJavaScriptInIsolatedWorld?: (worldId: number, scripts: { code: string }[]) => Promise<unknown>;
	};
	log.info("inject sweetspot-agent", { isolated: process.contextIsolated, readyState: document.readyState });
	console.info("[SWEETSPOT][preload] inject agent", { isolated: process.contextIsolated, readyState: document.readyState });
	try {
		if (typeof frame.executeJavaScriptInIsolatedWorld === "function") {
			await frame.executeJavaScriptInIsolatedWorld(0, [{ code: SWEETSPOT_AGENT_SOURCE }]);
		} else {
			await webFrame.executeJavaScript(SWEETSPOT_AGENT_SOURCE);
		}
		log.info("sweetspot-agent inject ok");
	} catch (err) {
		log.warn("sweetspot-agent inject failed", err);
	}
}

const pluginManager = initUtils.createPluginManager();
const initFn = initUtils.createInitFunction(pluginManager);

window.__sweetspot_loadingPromise = domUtils.createLoadingPromise();
assignPreload("__initSWEETSPOT", initFn);

let bootStarted = false;
async function bootChromecastShim(): Promise<boolean> {
	if (!isChromecastEnabledFromArgv(process.argv)) return false;
	try {
		const { startChromecastShim } = await import("./chromecast");
		return await startChromecastShim();
	} catch (err) {
		log.warn("chromecast shim failed", err);
		return false;
	}
}

async function bootSweetspot(): Promise<void> {
	// Agent must listen before plugins post sweetspot-ready, else page isYTMLoaded stays false.
	await injectSweetspotAgent();
	if (isChromecastEnabledFromArgv(process.argv) && isYoutubeMusicHost()) {
		const ok = await bootChromecastShim();
		pluginManager.setChromecastShimReady(ok);
	}
	await initFn();
}
function scheduleBoot(from: string): void {
	if (bootStarted) {
		log.info("boot already started, skip", { from });
		return;
	}
	bootStarted = true;
	log.info("boot start", { from, readyState: document.readyState });
	console.info("[SWEETSPOT][preload] boot start", { from, readyState: document.readyState });
	void bootSweetspot().catch((err) => {
		logger.error("Failed to initialize SWEETSPOT", err);
	});
}
void injectSweetspotAgent();
process.once("loaded", () => scheduleBoot("process.loaded"));
exposeData.domUtils.ensureDomLoaded(() => scheduleBoot("dom"));
