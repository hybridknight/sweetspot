import { THEME_PRESETS } from "@shared/themes/catalog";
import { buildSync } from "esbuild";
import { compileString } from "sass";
import { beforeAll, describe, expect, it } from "vitest";
import lyricsCss from "../../../../../renderer-plugins/youtube/lyrics/styles.css?raw";
import { BUNDLED_THEMES } from "../registry";
import { type BrowserCase, type ContrastSample, measureContrast, runBrowserCases } from "./browser";
import fixture from "./fixtures/panels.html?raw";

interface PanelSnapshot {
	activeIndex: number;
	activeTop: number;
	listHeight: number;
	visibleLines: number;
	outerScroll: number;
	overflow: boolean;
	fontSize: number;
	lineHeight: number;
	scrollbarClearance: number;
	commentSizes: string[];
	commentBackground: string;
	samples: ContrastSample[];
}
const results = new Map<string, PanelSnapshot>();
const widths = [320, 480];

beforeAll(async () => {
	// Mount the real React lyrics view so its ResizeObserver, padding and
	// auto-scroll participate; a static list would miss the blank-space bug.
	const bundle = buildSync({
		stdin: {
			contents: `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LyricsApp} from './apps/sweetspot/src/renderer-plugins/youtube/lyrics/ui/LyricsApp';
const lines = Array.from({length: 20}, (_, i) => ({timeMs: i * 10000, durationMs: 10000, text: 'A sample lyric line that wraps inside a narrow panel'}));
const shell = {snap: {status:'ready', videoId:'layout-test', result:{provider:'better-lyrics', lines}}, showTimeCodes:true, lineBackground:true, lineStyle:'fill', settingsEpoch:0};
const subscribe = () => () => {};
let timeMs = 45000;
const listeners = new Set();
window.panelSetTime = value => {timeMs = value; for (const listener of listeners) listener();};
const subscribeClock = listener => {listeners.add(listener); return () => listeners.delete(listener);};
createRoot(document.querySelector('#sweetspot-lyrics-root')).render(React.createElement(LyricsApp, {subscribeShell:subscribe, getShell:()=>shell, subscribeClock, getClock:()=>({timeMs}), onSeek:()=>{}}));`,
			resolveDir: process.cwd(),
			loader: "tsx",
		},
		bundle: true,
		write: false,
		format: "iife",
		jsx: "automatic",
		define: { "process.env.NODE_ENV": '"production"' },
	}).outputFiles[0].text;
	const cases: BrowserCase[] = [];
	for (const theme of THEME_PRESETS) for (const width of widths) cases.push({
		id: `${theme.id}/${width}`,
		css: `${compileString(BUNDLED_THEMES[theme.id].source).css}\n${lyricsCss}`,
		// Font loading and native smooth-scroll durations differ across OSes.
		// Measure settled geometry, without scrolling or relaxing assertions.
		settle: `(async () => {
			await document.fonts.ready;
			await new Promise((resolve, reject) => {
				const deadline = Date.now() + 1200;
				let previous = '', stable = 0;
				const poll = () => {
					const list = document.querySelector('.sweetspot-lyrics-list');
					const active = list.querySelector('.is-active');
					const current = [list.scrollTop, active.getBoundingClientRect().top, active.offsetHeight, list.clientWidth].join('/');
					stable = current === previous ? stable + 1 : 0;
					previous = current;
					if (stable >= 4) return resolve();
					if (Date.now() > deadline) return reject(new Error('Lyric layout did not settle'));
					requestAnimationFrame(poll);
				}; poll();
			});
		})()`,
		prepare: `(() => {
			for (const panel of document.querySelectorAll('.panel')) panel.style.width = '${width}px';
			if (!window.lyricsMounted) { window.lyricsMounted = true; ${bundle} }
		})()`,
		evaluate: `(() => {
			const list = document.querySelector('.sweetspot-lyrics-list');
			const active = list.querySelector('.is-active');
			const rect = list.getBoundingClientRect();
			const tab = list.closest('ytmusic-tab-renderer');
			const comments = document.querySelector('ytmusic-comments');
			return {
				activeIndex: Number(active.dataset.index),
				activeTop: active.getBoundingClientRect().top - rect.top,
				listHeight: rect.height,
				visibleLines: [...list.children].filter(e => { const r=e.getBoundingClientRect(); return r.top >= rect.top && r.bottom <= rect.bottom; }).length,
				outerScroll: tab.scrollHeight - tab.clientHeight,
				overflow: [...document.querySelectorAll('.panel')].some(e => e.scrollWidth > e.clientWidth),
				fontSize: parseFloat(getComputedStyle(active).fontSize),
				lineHeight: parseFloat(getComputedStyle(active).lineHeight),
				scrollbarClearance: rect.left + list.clientWidth - active.getBoundingClientRect().right,
				commentSizes: ['#content-text', '#author-text', '#published-time-text a', '#toolbar button span'].map(s => getComputedStyle(comments.querySelector(s)).fontSize),
				commentBackground: getComputedStyle(comments).backgroundColor,
				samples: (${measureContrast.toString()})('[data-check]'),
			};
		})()`,
	});
	cases.push({
		...cases.find(c => c.id === "mnml/320")!,
		id: "mnml/reflow",
		prepare: `(() => {
			const list = document.querySelector('.sweetspot-lyrics-list');
			list.children[0].style.paddingBottom = '120px';
			list.dispatchEvent(new Event('scroll'));
			window.panelSetTime(85000);
		})()`,
	});
	cases.push({
		...cases.find(c => c.id === "mnml/320")!,
		id: "mnml/last-line",
		prepare: "for (const panel of document.querySelectorAll('.panel')) panel.style.width = '320px'; window.panelSetTime(195000); new Promise(resolve => setTimeout(resolve, 550))",
	});
	for (const [id, result] of await runBrowserCases<PanelSnapshot>(cases, fixture)) results.set(id, result);
}, 60_000);

describe("lyrics and comments panel layout", () => {
	it("keeps following playback after reflow-generated scroll events", () => {
		const result = results.get("mnml/reflow")!;
		expect(result.activeIndex).toBe(8);
		expect(result.activeTop).toBeGreaterThanOrEqual(23);
		expect(result.activeTop).toBeLessThanOrEqual(97);
	});
	it("keeps the last lyric at the reading position without scrolling the outer tab", () => {
		const result = results.get("mnml/last-line")!;
		expect(result.activeIndex).toBe(19);
		expect(result.activeTop).toBeGreaterThanOrEqual(23);
		expect(result.activeTop).toBeLessThanOrEqual(97);
		expect(result.outerScroll).toBeLessThanOrEqual(1);
	});
	it.each(THEME_PRESETS)("keeps $name panels readable and contained at narrow and wide sizes", theme => {
		for (const width of widths) {
			const result = results.get(`${theme.id}/${width}`)!;
			expect(result.activeTop).toBeGreaterThanOrEqual(23);
			expect(result.activeTop).toBeLessThanOrEqual(97);
			expect(result.listHeight).toBeGreaterThan(500);
			expect(result.visibleLines).toBeGreaterThanOrEqual(3);
			expect(result.outerScroll).toBeLessThanOrEqual(1);
			expect(result.overflow).toBe(false);
			expect(result.fontSize).toBeGreaterThanOrEqual(18);
			expect(result.fontSize).toBeLessThanOrEqual(22);
			expect(result.lineHeight / result.fontSize).toBeGreaterThanOrEqual(1.5);
			expect(result.scrollbarClearance).toBeGreaterThanOrEqual(8);
			expect(result.commentSizes).toEqual(["14px", "13px", "12px", "14px"]);
			expect(result.commentBackground).toBe("rgba(0, 0, 0, 0)");
			expect(result.samples).toHaveLength(5);
			for (const sample of result.samples) expect(sample.contrast, `${theme.id}/${width}: ${sample.label}`).toBeGreaterThanOrEqual(4.5);
		}
	});
});
