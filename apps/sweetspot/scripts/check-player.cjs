const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process"),
  esbuild = require("esbuild");
const root = path.resolve(__dirname, ".."),
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-player-"));
for (const d of ["main", "preload"]) fs.mkdirSync(path.join(tmp, d));
fs.cpSync(path.join(root, "out/renderer"), path.join(tmp, "renderer"), { recursive: true });
fs.symlinkSync(path.join(root, "../../node_modules"), path.join(tmp, "node_modules"), "dir");
const alias = {
  "@": path.join(root, "src/renderer/src"),
  "@shared": path.join(root, "src/shared"),
  "@main": path.join(root, "src/main"),
  "@main/ytm/ytm-client": path.join(__dirname, "player-test-ytm.ts"),
};
// Exercise the live development renderer as well as production bundles. Newly
// discovered lazy-route dependencies can behave differently after Vite optimization.
const devUrl = process.env.PLAYER_TEST_DEV_URL;
const define = {
  "import.meta.env.DEV": devUrl ? "true" : "false",
  "import.meta.env.PROD": devUrl ? "false" : "true",
  "import.meta.env": "{}",
};
esbuild.buildSync({
  entryPoints: [path.join(root, "src/preload/player.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(tmp, "preload/player.js"),
  alias,
  external: ["electron"],
});
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "player-integration-main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(tmp, "main/index.js"),
  alias,
  define,
  external: ["electron"],
});
for (const [entry, outfile, platform] of [
  ["player-test-page.ts", "renderer/test-page.js", "browser"],
  ["player-appearance-check.tsx", "renderer/appearance-check.js", "browser"],
  ["player-appearance-preload.ts", "preload/appearance.js", "node"],
])
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, entry)],
    bundle: true,
    platform,
    format: platform === "node" ? "cjs" : "iife",
    jsx: "automatic",
    outfile: path.join(tmp, outfile),
    alias,
    define,
    external: platform === "node" ? ["electron"] : [],
    loader: { ".svg": "dataurl", ".ttf": "file" },
  });
fs.writeFileSync(
  path.join(tmp, "renderer/appearance.html"),
  `<html><head><link rel="stylesheet" href="assets/${fs.readdirSync(path.join(tmp, 'renderer/assets')).find(name => /^main-.*\.css$/.test(name))}"><link rel="stylesheet" href="appearance-check.css"></head><body><div id="root"></div><script src="appearance-check.js"></script></body></html>`,
);
fs.writeFileSync(
  path.join(tmp, "launch.cjs"),
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(tmp, "profile"))});require('./main/index.js');`,
);
const result = spawnSync(require("electron"), [path.join(tmp, "launch.cjs")], {
  stdio: "inherit",
  env: { ...process.env, ...(devUrl ? { ELECTRON_RENDERER_URL: devUrl } : {}), PLAYER_TEST_FULLSCREEN: process.argv.includes("--fullscreen") ? "1" : "0", PLAYER_PROFILE_SPECTRUM: process.argv.includes("--profile-spectrum") ? "1" : "0" },
  timeout: 90000,
});
if (result.status === 0) fs.rmSync(tmp, { recursive: true, force: true });
else console.error("Test files retained:", tmp);
process.exit(result.status ?? 1);
