// Live regression check: isolated signed-out YouTube Music, using the bundled
// theme sources and Electron's real keyboard/mouse input. Requires network access.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");

if (!process.versions.electron) {
  const { spawnSync } = require("node:child_process");
  const root = path.resolve(__dirname, "..");
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "sweetspot-search-validation-"));
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
  const themes = Object.values(BUNDLED_THEMES).map(({ id, source }) => ({
    id,
    css: require("sass").compileString(source).css,
  }));
  fs.writeFileSync(path.join(output, "themes.json"), JSON.stringify(themes));
  console.log("Validation evidence:", output);
  const result = spawnSync(require("electron"), [__filename, output], {
    stdio: "inherit",
    timeout: 120000,
  });
  process.exit(result.status ?? 1);
} else {
  const { app, BrowserWindow } = require("electron");
  const output = process.argv[2];
  app.setPath("userData", path.join(output, "profile"));
  const themes = JSON.parse(fs.readFileSync(path.join(output, "themes.json"), "utf8"));
  app.on("window-all-closed", () => {});
  app.whenReady().then(async () => {
    let win;
    let wc;
    const evaluate = (fn) => wc.executeJavaScript(`(${fn.toString()})()`);
    const paint = () =>
      evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const key = (keyCode) => {
      wc.sendInputEvent({ type: "keyDown", keyCode });
      wc.sendInputEvent({ type: "keyUp", keyCode });
    };
    const results = [];
    const timeout = setTimeout(() => {
      console.error("FAIL: live search check timed out");
      app.exit(1);
    }, 90000);
    try {
      for (const width of [1280, 800]) {
        win = new BrowserWindow({
          width,
          height: 850,
          show: true,
          webPreferences: { sandbox: true, backgroundThrottling: false },
        });
        wc = win.webContents;
        console.log("Loading live page at", width);
        await win.loadURL("https://music.youtube.com");
        console.log("Live page loaded");
        win.focus();
        wc.focus();
        await evaluate(() => {
          const input = document.querySelector("ytmusic-search-box input");
          if (!input.checkVisibility()) {
            const toggle = [
              ...document.querySelectorAll(
                "ytmusic-nav-bar button, ytmusic-nav-bar yt-icon-button",
              ),
            ].find(
              (e) =>
                e.checkVisibility() &&
                /search/i.test([e.getAttribute("aria-label"), e.getAttribute("title")].join(" ")),
            );
            if (!toggle) throw new Error("Collapsed search toggle was not found");
            toggle.click();
          }
          input.focus();
        });
        await wc.insertText("new");
        await evaluate(
          () =>
            new Promise((resolve, reject) => {
              const started = Date.now();
              const poll = () => {
                if (document.querySelector("ytmusic-search-suggestion yt-icon svg path"))
                  return resolve();
                if (Date.now() - started > 15000)
                  return reject(new Error("Live suggestions did not load"));
                setTimeout(poll, 100);
              };
              poll();
            }),
        );
        let cssKey;
        for (const { id, css } of themes) {
          if (cssKey) await wc.removeInsertedCSS(cssKey);
          cssKey = await wc.insertCSS(css);

          win.focus();
          wc.focus();
          await evaluate(() => document.querySelector("ytmusic-search-box input").focus());
          key("Left");
          await paint();

          const state = await evaluate(() => {
            const root = document.querySelector("ytmusic-search-box");
            const field = root.querySelector(".search-container");
            const input = root.querySelector("input");
            const popup = root.querySelector("#suggestion-list");
            const row = root.querySelector("ytmusic-search-suggestion");
            const rect = (e) => e.getBoundingClientRect().toJSON();
            const style = (e) => getComputedStyle(e);
            const icons = [
              root.querySelector(".search-button yt-icon"),
              row.querySelector("yt-icon"),
            ].map((e) => {
              const svg = e?.querySelector("svg path");
              return {
                width: e?.getBoundingClientRect().width,
                height: e?.getBoundingClientRect().height,
                visible: e && style(e).visibility,
                opacity: e && style(e).opacity,
                fill: svg && style(svg).fill,
                hasPath: !!svg?.getAttribute("d"),
              };
            });
            return {
              field: rect(field),
              popup: rect(popup),
              row: rect(row),
              radius: style(popup).borderRadius,
              popupBackground: style(popup).backgroundColor,
              inheritedRadius: style(popup).getPropertyValue("--sweetspot-theme-radius").trim(),
              outline: style(input).outlineStyle,
              fieldRing: style(field).boxShadow,
              focusVisible: input.matches(":focus-visible"),
              icons,
              viewport: innerWidth,
            };
          });
          const label = `${id}/${width}`;
          assert.equal(state.focusVisible, true, `${label}: keyboard focus was not exercised`);
          assert.equal(state.outline, "none", `${label}: rectangular input focus ring`);
          assert.notEqual(state.fieldRing, "none", `${label}: no rounded field focus indication`);
          assert.equal(
            state.popupBackground.startsWith("rgba("),
            false,
            `${label}: transparent popup`,
          );
          assert.equal(state.popup.width, state.field.width, `${label}: popup alignment`);
          assert.equal(state.popup.top - state.field.bottom, 8, `${label}: popup gap`);
          assert.ok(
            state.popup.left >= 0 && state.popup.right <= state.viewport,
            `${label}: outside viewport`,
          );
          assert.ok(parseFloat(state.radius) <= 20, `${label}: oval popup clipping`);
          assert.ok(
            parseFloat(state.inheritedRadius) <= 20,
            `${label}: pill radius leaked to rows`,
          );
          assert.ok(state.row.height >= 48, `${label}: cramped suggestion`);
          for (const icon of state.icons) {
            assert.ok(
              icon.width > 0 && icon.height > 0 && icon.hasPath,
              `${label}: missing search icon`,
            );
            assert.equal(icon.visible, "visible", `${label}: hidden search icon`);
            assert.notEqual(icon.opacity, "0", `${label}: transparent search icon`);
            assert.ok(
              icon.fill && !["none", "rgba(0, 0, 0, 0)"].includes(icon.fill),
              `${label}: unpainted search icon`,
            );
          }
          key("Down");
          await paint();
          const selected = await evaluate(() => {
            const input = document.querySelector("ytmusic-search-box input");
            const row = document.querySelector("ytmusic-search-suggestion.selected-suggestion");
            return {
              active: input.getAttribute("aria-activedescendant"),
              background: row && getComputedStyle(row).backgroundColor,
              elevated: getComputedStyle(input)
                .getPropertyValue("--sweetspot-theme-elevated")
                .trim(),
            };
          });
          assert.ok(selected.active && selected.background, `${label}: keyboard selection failed`);
          const hoverRect = await evaluate(() =>
            document.querySelector("ytmusic-search-suggestion").getBoundingClientRect().toJSON(),
          );
          const hoverPoint = {
            x: Math.round(hoverRect.x + hoverRect.width / 2),
            y: Math.round(hoverRect.y + hoverRect.height / 2),
          };
          wc.sendInputEvent({ type: "mouseMove", ...hoverPoint });
          await paint();
          const hover = await evaluate(() => {
            const row = document.querySelector("ytmusic-search-suggestion");
            return {
              hovered: row.matches(":hover"),
              background: getComputedStyle(row).backgroundColor,
            };
          });
          assert.ok(
            hover.hovered && hover.background !== "rgba(0, 0, 0, 0)",
            `${label}: no hover feedback`,
          );
          fs.writeFileSync(
            path.join(output, `${id}-${width}.png`),
            (await wc.capturePage()).toPNG(),
          );
          results.push({ theme: id, width, ...state, keyboard: selected, hover });
          console.log("PASS", label);
          wc.sendInputEvent({ type: "mouseMove", x: 1, y: 840 });
          key("Up");
        }
        win.destroy();
      }
      fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2));
      console.log(
        `PASS: ${results.length} live layouts. Signed-in history/removal is not covered.`,
      );
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      if (wc && !wc.isDestroyed()) {
        fs.writeFileSync(path.join(output, "failure.png"), (await wc.capturePage()).toPNG());
      }
      console.error(error);
      clearTimeout(timeout);
      app.exit(1);
    }
  });
}
