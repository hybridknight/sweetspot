import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

export interface BrowserCase {
	id: string;
	css: string;
	url?: string;
	prepare?: string;
	evaluate: string;
}

// Uses the app's Chromium engine without touching the user's profile. The runner
// is temporary test infrastructure, never a shipped app entry point.
export async function runBrowserCases<T>(cases: BrowserCase[], html: string, live = false): Promise<Map<string, T>> {
	const directory = await mkdtemp(path.join(tmpdir(), "sweetspot-theme-test-"));
	try {
		await writeFile(path.join(directory, "fixture.html"), html);
		await writeFile(path.join(directory, "cases.json"), JSON.stringify(cases));
		await writeFile(path.join(directory, "main.cjs"), `
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
app.setPath("userData", path.join(__dirname, "profile"));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1440, height: 1000,
    webPreferences: { sandbox: true, backgroundThrottling: false } });
  if (!${live}) win.webContents.session.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] }, (_, reply) => reply({ cancel: true }));
  const results = [];
  let currentUrl, key;
  for (const test of JSON.parse(fs.readFileSync(path.join(__dirname, "cases.json"), "utf8"))) {
    const url = test.url || require("node:url").pathToFileURL(path.join(__dirname, "fixture.html")).href;
    if (url !== currentUrl) {
      await win.loadURL(url);
      currentUrl = url;
      key = undefined;
    }
    if (test.prepare) await win.webContents.executeJavaScript(test.prepare);
    if (key) await win.webContents.removeInsertedCSS(key);
    key = await win.webContents.insertCSS(test.css);
    // Settle palette transitions before measuring real computed styles.
    await win.webContents.executeJavaScript("new Promise(r => setTimeout(r, 400))");
    results.push([test.id, await win.webContents.executeJavaScript(test.evaluate)]);
  }
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(results));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
`);
		const env = { ...process.env };
		delete env.ELECTRON_RUN_AS_NODE;
		const electron = createRequire(import.meta.url)("electron") as string;
		// Linux's native sandbox initializes before main.cjs runs, so this must be
		// a launch argument. It applies only to this isolated test process.
		const args = process.platform === "linux" ? ["--no-sandbox", path.join(directory, "main.cjs")] : [path.join(directory, "main.cjs")];
		await promisify(execFile)(electron, args, { env, timeout: 120_000, maxBuffer: 1024 * 1024 });
		return new Map(JSON.parse(await readFile(path.join(directory, "results.json"), "utf8")));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

export interface ContrastSample {
	label: string;
	contrast: number;
	color: string;
	fill: string;
	gradient: string;
}

// Self-contained so it can run inside Chromium, for fixtures and live pages.
export function measureContrast(selector: string): ContrastSample[] {
	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
	const decode = (value: string): number[] => {
		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = value;
		ctx.fillRect(0, 0, 1, 1);
		return Array.from(ctx.getImageData(0, 0, 1, 1).data);
	};
	const blend = (fg: number[], bg: number[]) => fg.slice(0, 3).map((v, i) => v * fg[3] / 255 + bg[i] * (1 - fg[3] / 255));
	const luminance = (rgb: number[]) => rgb.map(v => {
		const n = v / 255;
		return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
	}).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
	const ratio = (a: number[], b: number[]) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
	const stops = (gradient: string) => (gradient.match(/rgba?\([^)]*\)|color\([^)]*\)/g) ?? []).map(decode);
	return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(el => {
		const r = el.getBoundingClientRect();
		return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
	}).map(el => {
		const chain: HTMLElement[] = [];
		let opacity = 1;
		for (let node: HTMLElement | null = el; node; node = node.parentElement) {
			chain.unshift(node);
			opacity *= Number(getComputedStyle(node).opacity);
		}
		let backgrounds = [[255, 255, 255]];
		for (const node of chain) {
			const style = getComputedStyle(node);
			if (node === el && el.dataset.paint === "background") continue;
			backgrounds = backgrounds.map(bg => blend(decode(style.backgroundColor), bg));
			if (style.backgroundClip !== "text" && style.backgroundImage !== "none") {
				const colors = stops(style.backgroundImage);
				if (colors.length) backgrounds = backgrounds.flatMap(bg => colors.map(c => blend(c, bg)));
			}
		}
		const style = getComputedStyle(el);
		const textFill = style.webkitTextFillColor || style.color;
		const foregrounds = el.dataset.paint === "background" ? [decode(style.backgroundColor)] : style.backgroundClip === "text" ? stops(style.backgroundImage) : [decode(textFill)];
		const contrast = foregrounds.length ? Math.min(...foregrounds.flatMap(fg => backgrounds.map(bg => ratio(blend([fg[0], fg[1], fg[2], fg[3] * opacity], bg), bg)))) : 1;
		return { label: el.dataset.check || el.id || el.className, contrast, color: style.color, fill: textFill, gradient: style.backgroundImage };
	});
}
