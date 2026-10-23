// Live page contrast audit in an isolated, signed-out Electron session.
// Requires network access; it never uses or modifies the user's music profile.
// THEME_AUDIT_PAGES accepts comma-separated page labels for focused reruns.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
if (!process.versions.electron) {
  const root = path.resolve(__dirname, "..");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-theme-pages-"));
  require("esbuild").buildSync({
    entryPoints: [path.join(root, "src/main/trpc/routers/themes/registry.ts")],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: path.join(output, "themes.cjs"),
    alias: { "@main": path.join(root, "src/main"), "@shared": path.join(root, "src/shared") },
    loader: { ".scss": "text", ".woff2": "dataurl" },
  });
  const { BUNDLED_THEMES } = require(path.join(output, "themes.cjs"));
  fs.writeFileSync(
    path.join(output, "themes.json"),
    JSON.stringify(
      Object.values(BUNDLED_THEMES).map((t) => ({
        id: t.id,
        css: require("sass").compileString(t.source).css,
      })),
    ),
  );
  console.log("Audit evidence:", output);
  const result = require("node:child_process").spawnSync(
    require("electron"),
    [__filename, output],
    { stdio: "inherit", timeout: 360000 },
  );
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require("electron");
  const output = process.argv[2];
  app.setPath("userData", path.join(output, "profile"));
  app
    .whenReady()
    .then(async () => {
      const win = new BrowserWindow({
        show: false,
        width: 1440,
        height: 1000,
        webPreferences: { sandbox: true, backgroundThrottling: false },
      });
      const wc = win.webContents;
      const themes = JSON.parse(fs.readFileSync(path.join(output, "themes.json")));
      const report = [];
      const selected = process.env.THEME_AUDIT_PAGES?.split(",");
      const wants = (name) => !selected || selected.includes(name);
      const evaluate = (fn) => wc.executeJavaScript(`(${fn.toString()})()`);
      const pause = (ms) => new Promise((r) => setTimeout(r, ms));
      const routes = [
        ["Home", "/"],
        ["Explore", "/explore"],
        ["Library", "/library"],
        ["Search", "/search?q=HYBS+Tip+Toe"],
        ["Artist", "/channel/UCUbg9yP3GhrNoaWxsMsn0Gg"],
        ["Album", "/browse/MPREb_qvrWz9qnMmp"],
        ["Playlist", "/playlist?list=PLRUmxnvpvtsucKAp0zu0Rflax7cPETd3D"],
        ["Podcast", "/podcast/dhJGhlfp83E"],
        ["Player", "/watch?v=dHUq9xJcaZs"],
      ];
      async function audit(name) {
        if (!wants(name)) return;
        let key;
        for (const theme of themes) {
          if (key) await wc.removeInsertedCSS(key);
          key = await wc.insertCSS(theme.css);
          await pause(350); // Let upstream palette transitions finish before measuring.
          await evaluate(
            () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
          );
          const samples = [];
          for (const position of [0, 600]) {
            await wc.executeJavaScript(
              `for (const e of document.querySelectorAll('ytmusic-app-layout, #browse-page, #tab-renderer, ytmusic-tab-renderer, #contents.ytmusic-section-list-renderer')) if(e.scrollHeight > e.clientHeight && e.checkVisibility()) e.scrollTop = ${position}`,
            );
            samples.push(await evaluate(inspectContrast));
          }
          const issues = [
            ...new Map(
              samples.flatMap((s) => s.issues).map((i) => [i.selector + i.text, i]),
            ).values(),
          ];
          report.push({
            page: name,
            theme: theme.id,
            checked: samples.reduce((n, s) => n + s.checked, 0),
            issues,
          });
          if (theme.id === "mnml")
            fs.writeFileSync(
              path.join(output, name.replace(/[^a-z0-9]/gi, "-") + ".png"),
              (await wc.capturePage()).toPNG(),
            );
          console.log(
            `${name} / ${theme.id}: ${issues.length} contrast issues (${samples[0].checked} visible text samples)`,
          );
        }
        if (key) await wc.removeInsertedCSS(key);
        fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
      }
      for (const [name, route] of routes) {
        if (!wants(name) && name !== "Player") continue;
        await win.loadURL("https://music.youtube.com" + route);
        await pause(2800);
        await evaluate(() => document.querySelector("video")?.pause());
        await audit(name);
      }
      for (const name of ["Up next", "Lyrics", "Comments", "Related"]) {
        if (!wants(name)) continue;
        const found = await wc.executeJavaScript(
          `(()=>{const tab=[...document.querySelectorAll('.tab-header')].find(e=>e.textContent.trim()===${JSON.stringify(name)});if(!tab || tab.getAttribute('aria-disabled')==='true')return false;tab.click();return true;})()`,
        );
        if (!found) {
          report.push({ page: name, skipped: "Tab unavailable while signed out" });
          continue;
        }
        await pause(1800);
        await audit(name);
      }
      // Open read-only controls, without posting a comment or changing account settings.
      await evaluate(() =>
        [...document.querySelectorAll(".tab-header")]
          .find((e) => /comments/i.test(e.textContent))
          ?.click(),
      );
      await pause(500);
      await evaluate(() =>
        document.querySelector("yt-sort-filter-sub-menu-renderer #label")?.click(),
      );
      await pause(500);
      if (
        await evaluate(() =>
          [
            ...document.querySelectorAll("yt-sort-filter-sub-menu-renderer tp-yt-iron-dropdown"),
          ].some((e) => e.checkVisibility()),
        )
      )
        await audit("Comment sort menu");
      else report.push({ page: "Comment sort menu", skipped: "Sort menu did not open" });
      for (const label of ["New releases", "Charts", "Moods & genres"]) {
        if (!wants(label)) continue;
        await win.loadURL("https://music.youtube.com/explore");
        await pause(2200);
        const opened = await wc.executeJavaScript(
          `(()=>{const button=[...document.querySelectorAll('ytmusic-navigation-button-renderer button')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!button)return false;button.click();return true;})()`,
        );
        if (opened) {
          await pause(1800);
          await audit(label);
        } else report.push({ page: label, skipped: "Navigation unavailable" });
      }
      const menuOpened = await evaluate(() => {
        const button = document.querySelector("ytmusic-nav-bar #menu-button");
        if (!button) return false;
        button.click();
        return true;
      });
      if (menuOpened) {
        await pause(500);
        await audit("Navigation menu");
        const settingsOpened = await evaluate(() => {
          const entry = [
            ...document.querySelectorAll(
              "ytmusic-menu-navigation-item-renderer,ytmusic-menu-service-item-renderer,yt-formatted-string",
            ),
          ].find((e) => e.checkVisibility() && e.textContent.trim() === "Settings");
          if (!entry) return false;
          entry.click();
          return true;
        });
        if (settingsOpened) {
          await pause(600);
          await audit("Settings dialog");
        } else
          report.push({
            page: "Settings dialog",
            skipped: "Settings unavailable while signed out",
          });
      } else report.push({ page: "Navigation menu", skipped: "Menu unavailable" });
      fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
      const failures = report.filter((r) => r.issues?.length);
      console.log(
        `Audit complete: ${report.length} page/theme cases; ${failures.length} cases with contrast issues. Evidence: ${output}`,
      );
      app.exit(failures.length ? 1 : 0);
    })
    .catch((e) => {
      console.error(e);
      app.exit(1);
    });
}
function inspectContrast() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const colors = new Map();
  const rgba = (value) => {
    if (colors.has(value)) return [...colors.get(value)];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const color = [...ctx.getImageData(0, 0, 1, 1).data];
    colors.set(value, color);
    return [...color];
  };
  const blend = (a, b) => a.slice(0, 3).map((v, i) => (v * a[3]) / 255 + b[i] * (1 - a[3] / 255));
  const lum = (rgb) =>
    rgb
      .map((v) => {
        const n = v / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const styles = new WeakMap();
  const styleOf = (el) => {
    if (!styles.has(el)) styles.set(el, getComputedStyle(el));
    return styles.get(el);
  };
  const issues = [];
  let checked = 0;
  // Walk actual text nodes so nested attributed strings and newer view models
  // are checked too, rather than relying on a fixed list of component classes.
  const parents = new Set(document.querySelectorAll("input"));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent.trim() && !node.parentElement.closest("script, style, template, noscript"))
      parents.add(node.parentElement);
  }
  for (const el of parents) {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    const rect = el.getBoundingClientRect();
    if (
      !rect.width ||
      !rect.height ||
      rect.bottom < 0 ||
      rect.top > innerHeight ||
      rect.right < 0 ||
      rect.left > innerWidth
    )
      continue;
    const text =
      el.tagName === "INPUT"
        ? el.value || el.placeholder
        : [...el.childNodes]
            .filter((n) => n.nodeType === 3)
            .map((n) => n.textContent)
            .join("")
            .trim();
    if (!text) continue;
    // Artwork/video overlays intentionally keep a white foreground over media.
    if (
      el.closest(
        "ytmusic-item-thumbnail-overlay-renderer, .song-media-controls, ytmusic-player #player, ytmusic-immersive-header-renderer",
      )
    )
      continue;
    const style = styleOf(el),
      chain = [];
    let opacity = 1;
    for (let n = el; n; n = n.parentElement) {
      chain.unshift(n);
      opacity *= Number(styleOf(n).opacity);
    }
    const bg = chain.reduce(
      (bg, n) => blend(rgba(styleOf(n).backgroundColor), bg),
      [255, 255, 255],
    );
    const color = rgba(style.color);
    color[3] *= opacity;
    const ratio = contrast(blend(color, bg), bg);
    checked++;
    const minimum =
      Number.parseFloat(style.fontSize) >= 24 ||
      (Number.parseFloat(style.fontSize) >= 18.66 && Number.parseFloat(style.fontWeight) >= 700)
        ? 3
        : 4.5;
    if (ratio + 0.02 < minimum && !el.closest('[disabled], [aria-disabled="true"]'))
      issues.push({
        selector:
          el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + [...el.classList].join("."),
        text: text.slice(0, 80),
        color: style.color,
        bg,
        opacity,
        ratio: Math.round(ratio * 100) / 100,
      });
  }
  return { checked, issues };
}
