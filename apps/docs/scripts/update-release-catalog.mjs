import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** Only publish a catalog once all supported installers are available. */
export function createReleaseCatalog(release) {
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
    throw new Error("The download catalog requires a published stable release");
  }
  const assets = release.assets.filter((asset) => /\.(exe|dmg|zip)$/.test(asset.name));
  const windows = assets.some((asset) => asset.name.endsWith("-setup.exe"));
  const armMac = assets.some((asset) => asset.name.endsWith("-arm64.dmg"));
  const intelMac = assets.some((asset) => asset.name.endsWith(".dmg") && !asset.name.includes("arm64"));
  if (!windows || !armMac || !intelMac || assets.some((asset) => asset.state !== "uploaded" || asset.size <= 0)) {
    throw new Error("The release is missing complete Windows or macOS installers");
  }
  return {
    tag_name: release.tag_name,
    name: release.name,
    html_url: release.html_url,
    published_at: release.published_at,
    body: release.body,
    prerelease: false,
    draft: false,
    distribution_notice: "Windows is unsigned. macOS downloads are ad-hoc signed and not notarized.",
    checksum_url: release.assets.find((asset) => asset.name === "SHA256SUMS.txt")?.browser_download_url,
    assets: assets.map(({ name, browser_download_url, size, content_type }) => ({
      name, browser_download_url, size, content_type,
    })),
  };
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? "hybridknight/sweetspot";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GitHub latest release returned HTTP ${response.status}`);
  const catalog = createReleaseCatalog(await response.json());
  await writeFile(new URL("../content/releases/latest.json", import.meta.url), `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`Updated website download catalog to ${catalog.tag_name}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
