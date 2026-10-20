import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild, type Plugin } from "vite";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let world0Queue: Promise<void> = Promise.resolve();
let world0Ready = false;

async function buildWorld0(minify: boolean): Promise<void> {
	await viteBuild({
		configFile: false,
		logLevel: "warn",
		root: appRoot,
		resolve: {
			alias: {
				"@shared": path.resolve(appRoot, "src/shared"),
				"@plugins": path.resolve(appRoot, "src/renderer-plugins"),
				"@preload": path.resolve(appRoot, "src/preload"),
			},
		},
		plugins: [
			{
				name: "sweetspot-world0-no-electron",
				enforce: "pre",
				resolveId(id) {
					if (id === "electron" || id.startsWith("electron/")) {
						throw new Error(
							`world0 host must not import "${id}" (page world has no Node/Electron). Keep electron imports in preload-only modules.`,
						);
					}
				},
			},
		],
		build: {
			lib: {
				entry: path.resolve(appRoot, "src/renderer-plugins/youtube/world0/host.ts"),
				name: "SweetspotWorld0Host",
				formats: ["iife"],
				fileName: () => "sweetspot-world0-host.js",
			},
			outDir: path.resolve(appRoot, "src/preload/generated"),
			emptyOutDir: false,
			sourcemap: false,
			minify,
			rollupOptions: {
				external: ["electron"],
				output: {
					inlineDynamicImports: true,
				},
			},
		},
	});
}

function ensureWorld0(force = false): Promise<void> {
	const minify = process.env.NODE_ENV === "production";
	world0Queue = world0Queue.then(build, build);
	return world0Queue;

	async function build() {
		if (world0Ready && !force) return;
		await buildWorld0(minify);
		world0Ready = true;
		console.log("[sidecar] world0 host built");
	}
}

function isWorld0Path(file: string): boolean {
	const n = file.replace(/\\/g, "/");
	if (n.includes("/preload/generated/")) return false;
	return n.includes("/renderer-plugins/youtube/") || n.includes("/shared/protocol/") || n.includes("/shared/ytm/");
}

/** Preload: build world0 IIFE before `?raw` import resolves. */
export function sweetspotWorld0BuildPlugin(): Plugin {
	return {
		name: "sweetspot-world0-build",
		enforce: "pre",
		async buildStart() {
			await ensureWorld0(false);
		},
	};
}

/**
 * Renderer: build world0 and watch sources in `electron-vite dev`.
 * World0 file changes rewrite generated host -> preload watcher picks up `?raw`.
 */
export function sweetspotSidecarWatchPlugin(): Plugin {
	let watchWired = false;

	return {
		name: "sweetspot-sidecar-watch",
		enforce: "pre",
		async buildStart() {
			await ensureWorld0(false);
		},
		configureServer(server) {
			if (watchWired) return;
			watchWired = true;
			void ensureWorld0(false);

			for (const root of [
				path.resolve(appRoot, "src/renderer-plugins/youtube"),
				path.resolve(appRoot, "src/shared/protocol"),
				path.resolve(appRoot, "src/shared/ytm"),
			]) {
				server.watcher.add(root);
			}

			server.watcher.on("change", (file) => {
				if (isWorld0Path(file)) void ensureWorld0(true);
			});
		},
	};
}
