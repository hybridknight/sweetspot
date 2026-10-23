import { THEME_PRESETS } from "@shared/themes/catalog";
import { compileString } from "sass";
import { beforeAll, describe, expect, it } from "vitest";
import { BUNDLED_THEMES } from "../registry";
import { type BrowserCase, type ContrastSample, measureContrast, runBrowserCases } from "./browser";

// Opt in explicitly: SWEETSPOT_LIVE_THEME_TESTS=1 pnpm test live.test.ts
// Linux requires a display, e.g. xvfb-run --auto-servernum pnpm test live.test.ts.
const live = process.env.SWEETSPOT_LIVE_THEME_TESTS === "1";
const pages = [
	{ name: "Home", route: "/", ready: "ytmusic-carousel-shelf-renderer .title", selector: "ytmusic-carousel-shelf-renderer .title, ytmusic-carousel-shelf-renderer .subtitle" },
	{ name: "Explore", route: "/explore", ready: "ytmusic-navigation-button-renderer button", selector: "ytmusic-navigation-button-renderer yt-formatted-string" },
	{ name: "Search", route: "/search?q=HYBS+Tip+Toe", ready: "ytmusic-responsive-list-item-renderer", selector: "ytmusic-responsive-list-item-renderer .title, ytmusic-responsive-list-item-renderer .secondary-flex-columns yt-formatted-string" },
	{ name: "Comments", route: "/watch?v=dHUq9xJcaZs", ready: "ytmusic-comments #content-text", selector: "ytmusic-comments #content-text, ytmusic-comments #author-text, ytmusic-comments .published-time-text a, ytmusic-comments .ytAttributedStringLink" },
];
const results = new Map<string, ContrastSample[]>();

describe.skipIf(!live)("live YouTube Music theme smoke tests", () => {
	beforeAll(async () => {
		const cases: BrowserCase[] = [];
		for (const page of pages) {
			for (const theme of THEME_PRESETS) cases.push({
				id: `${page.name}/${theme.id}`,
				url: `https://music.youtube.com${page.route}`,
				css: compileString(BUNDLED_THEMES[theme.id].source).css,
				prepare: `new Promise((resolve, reject) => {
					const deadline = Date.now() + 20000;
					const poll = () => {
						document.querySelector('video')?.pause();
						${page.name === "Comments" ? "[...document.querySelectorAll('.tab-header')].find(e => /comments/i.test(e.textContent) && e.getAttribute('aria-selected') !== 'true')?.click();" : ""}
						if ([...document.querySelectorAll(${JSON.stringify(page.ready)})].some(e=>{const r=e.getBoundingClientRect();return e.checkVisibility() && e.textContent.trim() && r.height>0 && r.top<innerHeight && r.bottom>0;})) return resolve();
						if (Date.now() > deadline) return reject(new Error(${JSON.stringify(`${page.name} content did not load; check YouTube availability, consent, or markup changes`)}));
						setTimeout(poll, 100);
					}; poll();
				})`,
				evaluate: `(${measureContrast.toString()})(${JSON.stringify(page.selector)})`,
			});
		}
		for (const [id, samples] of await runBrowserCases<ContrastSample[]>(cases, "", true)) results.set(id, samples);
	}, 130_000);

	for (const page of pages) {
		it.each(THEME_PRESETS)(`keeps live ${page.name} readable in $name`, theme => {
			const samples = results.get(`${page.name}/${theme.id}`)!;
			expect(samples.length, "Expected visible live content; an empty page must not pass").toBeGreaterThan(0);
			for (const sample of samples) expect(sample.contrast, `${sample.label}: ${sample.color}`).toBeGreaterThanOrEqual(4.5);
		});
	}
});
