import assert from "node:assert/strict";
import { test } from "node:test";
import { createReleaseCatalog } from "./update-release-catalog.mjs";

function release(overrides = {}) {
  return {
    tag_name: "v1.0.5",
    name: "Sweet Spot 1.0.5",
    html_url: "https://github.com/hybridknight/sweetspot/releases/tag/v1.0.5",
    published_at: "2026-10-24T15:07:30Z",
    body: "Approved release message.",
    draft: false,
    prerelease: false,
    assets: ["sweetspot-1.0.5-setup.exe", "Sweet-Spot-1.0.5.dmg", "Sweet-Spot-1.0.5-arm64.dmg", "latest.yml", "SHA256SUMS.txt"].map((name) => ({
      name,
      browser_download_url: `https://github.com/hybridknight/sweetspot/releases/download/v1.0.5/${name}`,
      size: 100,
      state: "uploaded",
      content_type: "application/octet-stream",
    })),
    ...overrides,
  };
}

test("preserves approved notes and real download URLs, excluding updater metadata", () => {
  const source = release();
  const catalog = createReleaseCatalog(source);
  assert.equal(catalog.body, source.body);
  assert.deepEqual(catalog.assets.map((asset) => asset.browser_download_url), source.assets.slice(0, 3).map((asset) => asset.browser_download_url));
  assert.equal(catalog.checksum_url, source.assets[4].browser_download_url);
});

test("does not replace stable downloads with a draft or prerelease", () => {
  for (const overrides of [{ draft: true }, { prerelease: true }, { tag_name: "v1.1.0-rc.1" }]) {
    assert.throws(() => createReleaseCatalog(release(overrides)), /published stable release/);
  }
});

test("rejects missing or unfinished installers for any supported platform", () => {
  const source = release();
  for (const missing of source.assets.slice(0, 3)) {
    assert.throws(() => createReleaseCatalog(release({ assets: source.assets.filter((asset) => asset !== missing) })), /missing complete/);
  }
  source.assets[0].state = "uploading";
  assert.throws(() => createReleaseCatalog(source), /missing complete/);
});
