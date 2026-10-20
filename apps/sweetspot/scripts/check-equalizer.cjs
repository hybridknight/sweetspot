/* Run with node apps/sweetspot/scripts/check-equalizer.cjs. Uses the installed Electron. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-equalizer-check-"));
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "equalizer-audio-check.ts")],
  bundle: true,
  format: "iife",
  outfile: path.join(temporary, "audio.js"),
  alias: { "@shared": path.join(root, "src/shared") },
});
fs.writeFileSync(
  path.join(temporary, "index.html"),
  '<!doctype html><html><body><script src="audio.js"></script></body></html>',
);
fs.writeFileSync(
  path.join(temporary, "main.cjs"),
  `
const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(temporary, "profile"))});
app.whenReady().then(async () => {
 const window = new BrowserWindow({ show: false, webPreferences: { webSecurity: true, contextIsolation: true, nodeIntegration: false, autoplayPolicy: 'no-user-gesture-required' } });
 const timeout = setTimeout(() => { console.error('Equalizer runtime checks timed out'); app.exit(1); }, 30000);
 try {
  await window.loadFile(${JSON.stringify(path.join(temporary, "index.html"))});
  const result = await window.webContents.executeJavaScript('window.runEqualizerChecks()', true);
  console.log(JSON.stringify(result, null, 2)); clearTimeout(timeout); app.exit(0);
 } catch (error) { console.error(error); clearTimeout(timeout); app.exit(1); }
});
`,
);
const result = spawnSync(require("electron"), [path.join(temporary, "main.cjs")], {
  stdio: "inherit",
  timeout: 40000,
});
fs.rmSync(temporary, { recursive: true, force: true });
process.exit(result.status ?? 1);
