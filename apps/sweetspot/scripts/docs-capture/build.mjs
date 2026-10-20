import { build } from "vite";
import react from "@vitejs/plugin-react-swc";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
import { build as esbuild } from "esbuild";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync, symlinkSync, existsSync, readdirSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url)),
  root = resolve(here, "../.."),
  output = resolve(root, "out/docs-capture");
mkdirSync(output, { recursive: true });
const entry = resolve(output, "entry");
mkdirSync(entry, { recursive: true });
writeFileSync(
  resolve(entry, "index.html"),
  `<!doctype html><html class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#171717"><div id="root"></div><script type="module" src="${resolve(here, "page.tsx")}"></script></body></html>`,
);
const alias = {
  "@": resolve(root, "src/renderer/src"),
  "@shared": resolve(root, "src/shared"),
  "@main": resolve(root, "src/main"),
  "@plugins": resolve(root, "src/renderer-plugins"),
  "@preload": resolve(root, "src/preload"),
  "~": root,
};
await build({
  configFile: false,
  root: entry,
  base: "./",
  plugins: [react(), svgr(), tailwindcss()],
  resolve: { alias },
  build: { outDir: resolve(output, "renderer"), emptyOutDir: true },
});
for (const name of ["main", "preload"])
  await esbuild({
    entryPoints: [resolve(here, name + ".ts")],
    outfile: resolve(output, name + ".js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    alias,
    external: ["electron"],
  });
const modules = resolve(output, "node_modules");
if (!existsSync(modules)) symlinkSync(resolve(root, "../../node_modules"), modules, "dir");
const css = readdirSync(resolve(root, "out/renderer/assets")).find((name) =>
  /^main-.*\.css$/.test(name),
);
const html = resolve(output, "renderer/index.html");
const { readFileSync } = await import("node:fs");
writeFileSync(
  html,
  readFileSync(html, "utf8").replace(
    "</head>",
    `<link rel="stylesheet" href="../../renderer/assets/${css}"></head>`,
  ),
);
console.log(output);
