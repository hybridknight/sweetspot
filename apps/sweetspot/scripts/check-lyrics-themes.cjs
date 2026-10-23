// Render the real injected theme and lyrics CSS in Chromium, including theme switches.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");
const { compileString } = require("sass");
const root = path.resolve(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-lyrics-themes-"));
esbuild.buildSync({
  stdin: {
    contents:
      'export { THEME_PRESETS } from "./src/shared/themes/catalog"; export { createPresetSource } from "./src/main/trpc/routers/themes/preset-source";',
    resolveDir: root,
  },
  outfile: path.join(tmp, "themes.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  alias: { "@shared": path.join(root, "src/shared") },
  loader: { ".scss": "text", ".woff2": "dataurl" },
});
const { THEME_PRESETS, createPresetSource } = require(path.join(tmp, "themes.cjs"));
const themes = THEME_PRESETS.map((theme) => ({
  ...theme,
  css: compileString(createPresetSource(theme)).css,
}));
const lyrics = fs.readFileSync(
  path.join(root, "src/renderer-plugins/youtube/lyrics/styles.css"),
  "utf8",
);
const fixture = `<html dark darker-dark-theme><head><style id="theme"></style><style>${lyrics}</style>
<style>/* Upstream baseline loaded after the theme. */
html[darker-dark-theme][dark] { --yt-sys-color-baseline--text-primary: #f1f1f1; }
#content-text.ytd-comment-view-model, #author-text.ytd-comment-view-model, .count-text.ytd-comments-header-renderer { color: #f1f1f1; }
</style>
<style>* { transition: none !important; } body { margin: 0; } ytmusic-app { display: block; } #sweetspot-lyrics-root { height: 850px; max-width: 620px; }</style></head>
<body><ytmusic-app><ytmusic-player-page class="ytmusic-app"><div id="sweetspot-lyrics-root"><div class="sweetspot-lyrics-body">
<div class="sweetspot-lyrics-meta">Lyrics provider · synced</div>
<div class="sweetspot-lyrics-status">Lyrics status <div class="sweetspot-lyrics-status-hint">Status hint</div></div>
<div class="sweetspot-lyrics-loading-label">Loading lyrics…</div><div class="sweetspot-lyrics-spinner"><div class="sweetspot-lyrics-spinner-blade" style="--i: 0"></div></div>
<div class="sweetspot-lyrics-list">
<button class="sweetspot-lyrics-line"><span class="sweetspot-lyrics-line-content">Inactive line</span></button>
<button class="sweetspot-lyrics-line is-active"><span class="sweetspot-lyrics-line-content has-timecode"><span class="sweetspot-lyrics-time">0:24</span><span class="sweetspot-lyrics-text">Active line</span></span></button>
<button class="sweetspot-lyrics-line is-active line-bar" style="--sweetspot-line-progress: .5"><span class="sweetspot-lyrics-line-content">Line progress</span></button>
<button class="sweetspot-lyrics-line is-active"><span class="sweetspot-lyrics-line-content"><span class="sweetspot-lyrics-word is-sung">Sung </span><span class="sweetspot-lyrics-word is-current">current </span><span class="sweetspot-lyrics-word">upcoming</span></span></button>
<button class="sweetspot-lyrics-line is-active word-fill"><span class="sweetspot-lyrics-line-content"><span class="sweetspot-lyrics-word" style="--sweetspot-word-progress: 50%">Word progress</span></span></button>
</div><div class="sweetspot-lyrics-plain">Plain lyrics</div></div></div></ytmusic-player-page>
<ytmusic-comments><div class="count-text ytd-comments-header-renderer">Comment count</div><a id="author-text" class="ytd-comment-view-model">Author</a><div id="content-text" class="ytd-comment-view-model">Comment body <a class="ytAttributedStringLink" style="color: #3ea6ff">0:20</a></div><div class="published-time-text">Two days ago</div><div id="placeholder-area">Add a comment</div></ytmusic-comments>
</ytmusic-app></body></html>`;
fs.writeFileSync(path.join(tmp, "fixture.html"), fixture);
fs.writeFileSync(path.join(tmp, "data.json"), JSON.stringify(themes));
fs.writeFileSync(
  path.join(tmp, "main.cjs"),
  `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
app.setPath("userData", ${JSON.stringify(path.join(tmp, "profile"))});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 640, height: 900, webPreferences: { backgroundThrottling: false } });
  await win.loadFile(${JSON.stringify(path.join(tmp, "fixture.html"))});
  const themes = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(tmp, "data.json"))}, "utf8"));
  for (const theme of [...themes, themes.find(t => t.light), themes[0]]) {
    await win.webContents.executeJavaScript('document.querySelector("#theme").textContent = ' + JSON.stringify(theme.css));
    const baseline = await win.webContents.executeJavaScript('getComputedStyle(document.documentElement).getPropertyValue("--yt-sys-color-baseline--text-primary").trim()');
    if (baseline !== theme.text) throw new Error(theme.name + ": upstream dark baseline replaced the theme");
    const comment = await win.webContents.executeJavaScript('(() => {const text=getComputedStyle(document.querySelector("#content-text")); const probe=document.createElement("div");probe.style.color="var(--sweetspot-theme-text)";document.querySelector("ytmusic-app").appendChild(probe);const expected=getComputedStyle(probe).color;probe.remove();return text.color===expected && getComputedStyle(document.querySelector(".ytAttributedStringLink")).color===expected && getComputedStyle(document.querySelector("#author-text")).color===expected && getComputedStyle(document.querySelector(".count-text")).color===expected;})()');
    if (!comment) throw new Error(theme.name + ": unreadable comments");
    const results = await win.webContents.executeJavaScript('(' + ${checkFixture.toString()} + ')()');
    if (results.length) throw new Error(theme.name + ": " + results.join("; "));
    if (process.env.LYRICS_THEME_SCREENSHOTS) {
      fs.mkdirSync(process.env.LYRICS_THEME_SCREENSHOTS, { recursive: true });
      fs.writeFileSync(require("node:path").join(process.env.LYRICS_THEME_SCREENSHOTS, theme.id + ".png"), (await win.webContents.capturePage()).toPNG());
    }
    console.log("PASS " + theme.name + " lyrics, comments, links and late-loading dark baseline");
  }
  await win.webContents.executeJavaScript('document.querySelector("#theme").textContent = "html { --ytmusic-text-primary: #111111; --ytmusic-text-secondary: #545454; background: #fff; }"');
  const fallback = await win.webContents.executeJavaScript('(' + ${checkFixture.toString()} + ')()');
  if (fallback.length) throw new Error("Native palette fallback: " + fallback.join("; "));
  console.log("PASS native palette fallback");
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
`,
);
function checkFixture() {
  const errors = [];
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (value) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data);
  };
  const rgb = (value) => (Array.isArray(value) ? value : rgba(value).slice(0, 3));
  const composite = (fg, bg) =>
    fg.slice(0, 3).map((v, i) => (v * fg[3]) / 255 + bg[i] * (1 - fg[3] / 255));
  const backgroundOf = (el) => {
    const parents = [];
    for (let node = el; node; node = node.parentElement) parents.unshift(node);
    return parents.reduce(
      (bg, node) => composite(rgba(getComputedStyle(node).backgroundColor), bg),
      [255, 255, 255],
    );
  };
  const lum = (value) =>
    rgb(value)
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((s, n, i) => s + n * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  for (const selector of [
    ".sweetspot-lyrics-line-content",
    ".sweetspot-lyrics-word",
    ".sweetspot-lyrics-time",
    ".sweetspot-lyrics-meta",
    ".sweetspot-lyrics-status",
    ".sweetspot-lyrics-status-hint",
    ".sweetspot-lyrics-loading-label",
    ".sweetspot-lyrics-plain",
  ]) {
    for (const el of document.querySelectorAll(selector)) {
      const style = getComputedStyle(el);
      if (contrast(style.color, backgroundOf(el)) < 4.5)
        errors.push(selector + " has low contrast: " + style.color);
      if (!el.closest(".word-fill") && style.webkitTextFillColor !== style.color)
        errors.push(selector + " has mismatched text fill");
      for (let node = el; node && node.id !== "sweetspot-lyrics-root"; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 1)
          errors.push(selector + " faded by ancestor");
      }
    }
  }
  const word = getComputedStyle(document.querySelector(".word-fill .sweetspot-lyrics-word"));
  if (word.webkitTextFillColor !== "rgba(0, 0, 0, 0)" || word.backgroundImage === "none")
    errors.push("Missing word fill gradient");
  const bar = document.querySelector(".line-bar");
  if (getComputedStyle(bar).backgroundImage === "none")
    errors.push("Missing line progress gradient");
  const primary = getComputedStyle(bar).color;
  for (const alpha of [0.06, 0.18]) {
    if (
      contrast(primary, composite([...rgba(primary).slice(0, 3), alpha * 255], backgroundOf(bar))) <
      4.5
    )
      errors.push("Low contrast on line progress");
  }
  const spinner = getComputedStyle(document.querySelector(".sweetspot-lyrics-spinner-blade"));
  if (
    contrast(
      spinner.backgroundColor,
      backgroundOf(document.querySelector(".sweetspot-lyrics-spinner")),
    ) < 4.5
  )
    errors.push("Low contrast loading spinner");
  return errors;
}
const result = spawnSync(require("electron"), [path.join(tmp, "main.cjs")], {
  stdio: "inherit",
  timeout: 60000,
});
if (result.status === 0) fs.rmSync(tmp, { recursive: true, force: true });
else console.error("Test files retained:", tmp);
process.exit(result.status ?? 1);
