const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-equalizer-ui-"));
const alias = {
  "@shared": path.join(root, "src/shared"),
  "@main": path.join(root, "src/main"),
  "@plugins": path.join(root, "src/renderer-plugins"),
  "@": path.join(root, "src/renderer/src"),
  "@renderer": path.join(root, "src/renderer/src"),
};
const define = {
  "import.meta.env.DEV": "false",
  "import.meta.env.PROD": "true",
  "import.meta.env.MODE": '"production"',
  "import.meta.env.DEBUG": "false",
  "import.meta.env": "{}",
};
function bundle(input, output, platform = "browser", extra = {}) {
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, input)],
    bundle: true,
    platform,
    format: platform === "node" ? "cjs" : "iife",
    outfile: path.join(temporary, output),
    alias,
    define,
    jsx: "automatic",
    external: platform === "node" ? ["electron", "electron-conf/main"] : [],
    ...extra,
  });
}
bundle("equalizer-test-preload.ts", "preload.js", "node");
bundle("equalizer-test-player.ts", "player.js");
bundle("equalizer-ui-check.tsx", "ui.js");
bundle("equalizer-integration-main.ts", "main.js", "node", {
  alias: { ...alias, "@main/ytm/ytm-client": path.join(__dirname, "equalizer-test-ytm.ts") },
});
fs.writeFileSync(
  path.join(temporary, "player.html"),
  '<!doctype html><html><body><script src="player.js"></script></body></html>',
);
const assets = path.join(root, "out/renderer/assets");
const css = fs.existsSync(assets)
  ? fs.readdirSync(assets).find((name) => /^(?:main|index)-.*\.css$/.test(name))
  : undefined;
fs.writeFileSync(
  path.join(temporary, "ui.html"),
  `<!doctype html><html class="dark"><head>${css ? `<link rel="stylesheet" href="file://${path.join(assets, css)}">` : ""}</head><body><div id="app" style="max-width:800px;padding:24px;margin:auto"></div><script src="ui.js"></script></body></html>`,
);
fs.writeFileSync(
  path.join(temporary, "launch.cjs"),
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(temporary, "profile"))});require('./main.js');`,
);
// External runtime dependencies resolve from the project without copying installed packages.
fs.symlinkSync(path.join(root, "../../node_modules"), path.join(temporary, "node_modules"), "dir");
const result = spawnSync(require("electron"), [path.join(temporary, "launch.cjs")], {
  stdio: "inherit",
  timeout: 40000,
});
fs.rmSync(temporary, { recursive: true, force: true });
process.exit(result.status ?? 1);
