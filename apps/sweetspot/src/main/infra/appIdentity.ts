import { app } from "electron";
import path from "node:path";
import { mkdirSync, readFileSync } from "node:fs";
import { isProduction } from "./devUtils";

// Import before services: stores and encryption keys capture userData at module load.
function isPackagedLocalMacBuild(): boolean {
	if (process.platform !== "darwin" || !app.isPackaged) return false;
	try {
		return JSON.parse(readFileSync(path.join(app.getAppPath(), "package.json"), "utf8")).sweetspotLocalBuild === true;
	} catch {
		return false;
	}
}

const packagedLocalMacBuild = isPackagedLocalMacBuild();
app.setName(packagedLocalMacBuild ? "Sweet Spot Local" : "Sweet Spot");
const localMacBuild = process.platform === "darwin" && !app.isPackaged;
const profile = packagedLocalMacBuild ? "sweetspot-local" : localMacBuild && isProduction ? "sweetspot-preview" : isProduction ? "sweetspot" : "sweetspot-dev";
app.setPath("userData", path.join(app.getPath("appData"), profile));

// Ad-hoc packages keep OS encryption, but must not open a signed release's cookies or paired clients.
if (packagedLocalMacBuild) {
	const sessionData = path.join(app.getPath("userData"), "browser");
	mkdirSync(sessionData, { recursive: true });
	app.setPath("sessionData", sessionData);
}

// Unpackaged development and preview binaries use Electron's shared identity.
// Use a separate browser profile so existing Keychain-encrypted cookies are never
// opened with the mock key. Installed builds retain OS-backed cookie encryption.
if (localMacBuild) {
	const sessionData = path.join(app.getPath("userData"), "browser-dev");
	mkdirSync(sessionData, { recursive: true });
	app.setPath("sessionData", sessionData);
	app.commandLine.appendSwitch("use-mock-keychain");
}
