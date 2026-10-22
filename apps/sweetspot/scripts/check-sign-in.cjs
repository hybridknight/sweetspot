const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-sign-in-check-"));
for (const name of ["main", "preload"]) fs.mkdirSync(path.join(directory, name));
fs.cpSync(path.join(root, "out/renderer"), path.join(directory, "renderer"), { recursive: true });
fs.cpSync(path.join(root, "out/preload"), path.join(directory, "preload"), { recursive: true });
fs.symlinkSync(path.join(root, "../../node_modules"), path.join(directory, "node_modules"), "dir");
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "sign-in-integration-main.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: path.join(directory, "main/index.js"),
  alias: {
    "@main": path.join(root, "src/main"),
    "@shared": path.join(root, "src/shared"),
    "@translations": path.join(root, "src/translations"),
    "~/build/favicon.ico?asset": path.join(root, "build/favicon.ico"),
  },
  loader: { ".ico": "empty" },
  external: ["electron"],
  define: {
    "import.meta.env.PROD": "true",
    "import.meta.env.DEV": "false",
    "import.meta.env": "{}",
  },
});
fs.writeFileSync(
  path.join(directory, "launch.cjs"),
  `const {app}=require('electron');app.setPath('userData',${JSON.stringify(path.join(directory, "profile"))});app.commandLine.appendSwitch('use-mock-keychain');require('./main/index.js');`,
);
let result = spawnSync(require("electron"), [path.join(directory, "launch.cjs")], {
  stdio: "inherit",
  timeout: 90000,
  env: {
    ...process.env,
    SIGN_IN_CHECK_DIRECTORY: directory,
    SIGN_IN_CHECK_CHROME: process.argv.includes("--chrome") ? "1" : "0",
  },
});
if (result.status === 0)
  result = spawnSync(require("electron"), [path.join(directory, "launch.cjs")], {
    stdio: "inherit",
    timeout: 15000,
    env: { ...process.env, SIGN_IN_CHECK_DIRECTORY: directory, SIGN_IN_CHECK_RESTORE: "1" },
  });
console.log("Sign-in check artifacts:", directory);
process.exit(result.status ?? 1);
