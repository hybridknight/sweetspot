import { defineConfig } from "vite";
import monkey from "vite-plugin-monkey";

export default defineConfig({
	plugins: [
		monkey({
			entry: "src/main.ts",
			userscript: {
				name: "Sweet Spot Open Links",
				namespace: "sweetspot",
				description:
					"Open YouTube Music / YouTube / youtu.be pages in Sweet Spot via ssytm:// on load/navigate. Per-host Tampermonkey menu toggles (music.youtube on by default).",
				author: "hybridknight (https://github.com/hybridknight)",
				homepage: "https://sweetspot.bkk.ooo",
				homepageURL: "https://sweetspot.bkk.ooo",
				supportURL: "https://github.com/hybridknight/sweetspot/issues",
				match: [
					"*://music.youtube.com/*",
					"*://www.music.youtube.com/*",
					"*://youtube.com/*",
					"*://www.youtube.com/*",
					"*://m.youtube.com/*",
					"*://youtu.be/*",
					"*://www.youtu.be/*",
				],
				"run-at": "document-start",
				license: "MIT",
			},
			build: {
				fileName: "sweetspot-userscript.user.js",
			},
		}),
	],
});
