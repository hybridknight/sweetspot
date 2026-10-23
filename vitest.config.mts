import path from "node:path";
import { defineConfig } from "vitest/config";

const sweetspotSrc = path.resolve("apps/sweetspot/src");

const isCi = process.env.CI === "true";

export default defineConfig({
	resolve: {
		alias: {
			"@main": path.join(sweetspotSrc, "main"),
			"@shared": path.join(sweetspotSrc, "shared"),
		},
	},
	test: {
		server: { deps: { inline: ["electron-conf"] } },
		name: "sweetspot-workspace",
		environment: "node",
		// Render theme regressions with real raw styles instead of Vitest CSS stubs.
		css: { include: [/themes\/assets\/[^/]+\.scss(?:\?|$)/, /lyrics\/styles\.css/] },
		include: ["apps/**/src/**/*.{test,spec}.ts", "packages/**/src/**/*.{test,spec}.{ts,tsx}"],
		exclude: ["**/node_modules/**", "**/out/**", "**/dist/**", "**/.vite/**"],
		reporters: isCi ? ["default", "junit"] : ["default"],
		outputFile: isCi
			? {
					junit: "test-results/junit.xml",
				}
			: undefined,
	},
});
