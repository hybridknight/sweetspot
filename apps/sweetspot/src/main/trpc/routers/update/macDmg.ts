import type { GithubReleaseAsset } from "@shared/utils/github";

export function macDownloadTarget(arch: string, translated: boolean) {
	const architecture = arch === "arm64" || translated ? "arm64" : arch === "x64" ? "x64" : null;
	if (!architecture) throw new Error("Unsupported Mac architecture. Choose a download from the release page.");
	return { architecture, label: architecture === "arm64" ? "Apple Silicon" : "Intel" } as const;
}

/** Only open DMGs from this repository and this release, never arbitrary API URLs. */
export function selectMacDmg(assets: GithubReleaseAsset[], options: { owner: string; repo: string; tag: string; architecture: string }): string | null {
	const prefix = `/${options.owner}/${options.repo}/releases/download/${encodeURIComponent(options.tag)}/`;
	const candidates = assets.filter((asset) => {
		if (!/\.dmg$/i.test(asset.name)) return false;
		try {
			const url = new URL(asset.browser_download_url);
			return url.origin === "https://github.com" && !url.username && !url.password && url.pathname.startsWith(prefix) && /\.dmg$/i.test(url.pathname);
		} catch { return false; }
	});
	const arm = /(?:^|[-_. ])(?:arm64|aarch64)(?:[-_. ]|$)/i;
	const intel = /(?:^|[-_. ])(?:x64|x86_64|intel)(?:[-_. ]|$)/i;
	const universal = /(?:^|[-_. ])universal(?:[-_. ]|$)/i;
	const exact = candidates.find((asset) => options.architecture === "arm64" ? arm.test(asset.name) : intel.test(asset.name));
	const fallback = candidates.find((asset) => universal.test(asset.name))
		?? (options.architecture === "x64" ? candidates.find((asset) => !arm.test(asset.name) && !intel.test(asset.name)) : undefined);
	return (exact ?? fallback)?.browser_download_url ?? null;
}
