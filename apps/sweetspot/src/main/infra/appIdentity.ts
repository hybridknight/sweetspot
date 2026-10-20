import { mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { isProduction } from "./devUtils";

// Import before services: stores and encryption keys capture userData at module load.
app.setName("Sweet Spot");
const unpackagedMacBuild = process.platform === "darwin" && !app.isPackaged;
const profile = unpackagedMacBuild && isProduction ? "sweetspot-preview" : isProduction ? "sweetspot" : "sweetspot-dev";
app.setPath("userData", path.join(app.getPath("appData"), profile));

// Unpackaged development and preview binaries use Electron's shared identity.
// Use a separate browser profile so existing Keychain-encrypted cookies are never
// opened with the mock key. Installed builds retain OS-backed cookie encryption.
if (unpackagedMacBuild) {
	const sessionData = path.join(app.getPath("userData"), "browser-dev");
	mkdirSync(sessionData, { recursive: true });
	app.setPath("sessionData", sessionData);
	app.commandLine.appendSwitch("use-mock-keychain");
}
