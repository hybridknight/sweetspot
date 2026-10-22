import { describe, expect, it } from "vitest";
import { BROWSERS, defaultBrowserId, prioritizeBrowsers } from "./browserDiscovery";

describe("supported browser selection", () => {
  it.each([
    ["com.google.Chrome", "chrome"],
    ["google-chrome.desktop", "chrome"],
    ["ChromeHTML.ABC123", "chrome"],
    ["com.microsoft.edgemac", "edge"],
    ["MSEdgeHTM", "edge"],
    ["microsoft-edge.desktop", "edge"],
    ["com.brave.Browser", "brave"],
    ["brave-browser.desktop", "brave"],
    ["org.chromium.Chromium", "chromium"],
    ["com.vivaldi.Vivaldi", "vivaldi"],
    ["net.imput.helium", "helium"],
    ["com.apple.Safari", undefined],
    ["firefox.desktop", undefined],
    ["", undefined],
  ])("maps %s to %s", (input, expected) => expect(defaultBrowserId(input)).toBe(expected));
  it("prefers an installed supported default without changing fallback order", () => {
    const browsers = BROWSERS.map((browser) => ({ ...browser, executable: "/fake" }));
    expect(prioritizeBrowsers(browsers, "helium").map((browser) => browser.id)).toEqual([
      "helium",
      "chrome",
      "edge",
      "brave",
      "chromium",
      "vivaldi",
    ]);
    expect(browsers[0].id).toBe("chrome");
    expect(prioritizeBrowsers(browsers.slice(1), "chrome")[0].id).toBe("edge");
  });
});
