import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { checkAbort } from "./async";

const exec = promisify(execFile);
export type BrowserId = "chrome" | "edge" | "brave" | "chromium" | "vivaldi" | "helium";
export interface InstalledBrowser {
  id: BrowserId;
  name: string;
  executable: string;
}

export const BROWSERS: {
  id: BrowserId;
  name: string;
  mac: string;
  binary: string;
  windows: string[];
  linux: string[];
}[] = [
  {
    id: "chrome",
    name: "Chrome",
    mac: "Google Chrome",
    binary: "Google Chrome",
    windows: ["Google/Chrome/Application/chrome.exe"],
    linux: ["google-chrome-stable", "google-chrome"],
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    mac: "Microsoft Edge",
    binary: "Microsoft Edge",
    windows: ["Microsoft/Edge/Application/msedge.exe"],
    linux: ["microsoft-edge-stable", "microsoft-edge"],
  },
  {
    id: "brave",
    name: "Brave",
    mac: "Brave Browser",
    binary: "Brave Browser",
    windows: ["BraveSoftware/Brave-Browser/Application/brave.exe"],
    linux: ["brave-browser", "brave"],
  },
  {
    id: "chromium",
    name: "Chromium",
    mac: "Chromium",
    binary: "Chromium",
    windows: ["Chromium/Application/chrome.exe"],
    linux: ["chromium", "chromium-browser"],
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    mac: "Vivaldi",
    binary: "Vivaldi",
    windows: ["Vivaldi/Application/vivaldi.exe"],
    linux: ["vivaldi-stable", "vivaldi"],
  },
  {
    id: "helium",
    name: "Helium",
    mac: "Helium",
    binary: "Helium",
    windows: [
      "Helium/Application/helium.exe",
      "Helium/helium.exe",
      "imput/Helium/Application/chrome.exe",
      "Helium/Application/chrome.exe",
    ],
    linux: ["helium", "helium-browser"],
  },
];

export function defaultBrowserId(value: string): BrowserId | undefined {
  // Chromium must precede Chrome: Windows registers both using ChromeHTML.
  if (/chromium/i.test(value)) return "chromium";
  if (/helium/i.test(value)) return "helium";
  if (/vivaldi/i.test(value)) return "vivaldi";
  if (/brave/i.test(value)) return "brave";
  if (/msedge|microsoft[. -]?edge/i.test(value)) return "edge";
  if (/google[. -]?chrome|chromehtml|^chrome(?:\.desktop)?$/i.test(value)) return "chrome";
  return undefined;
}

export function prioritizeBrowsers(
  browsers: InstalledBrowser[],
  preferred?: BrowserId,
): InstalledBrowser[] {
  return [...browsers].sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred));
}

async function command(file: string, args: string[], signal: AbortSignal): Promise<string> {
  try {
    return (
      await exec(file, args, { timeout: 2500, maxBuffer: 512 * 1024, windowsHide: true, signal })
    ).stdout;
  } catch {
    checkAbort(signal);
    return "";
  }
}

async function getDefault(signal: AbortSignal): Promise<BrowserId | undefined> {
  if (process.platform === "darwin") {
    const raw = await command(
      "/usr/bin/plutil",
      [
        "-convert",
        "json",
        "-o",
        "-",
        join(
          homedir(),
          "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist",
        ),
      ],
      signal,
    );
    try {
      const handlers = JSON.parse(raw).LSHandlers as {
        LSHandlerURLScheme?: string;
        LSHandlerRoleAll?: string;
      }[];
      return defaultBrowserId(
        handlers.find((entry) => entry.LSHandlerURLScheme === "https")?.LSHandlerRoleAll ?? "",
      );
    } catch {
      return undefined;
    }
  }
  if (process.platform === "win32") {
    const value = await command(
      "reg.exe",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
        "/v",
        "ProgId",
      ],
      signal,
    );
    return defaultBrowserId(value);
  }
  return defaultBrowserId(
    (await command("xdg-settings", ["get", "default-web-browser"], signal)).trim(),
  );
}

export async function discoverBrowsers(signal: AbortSignal): Promise<InstalledBrowser[]> {
  const preferred = await getDefault(signal);
  const found: InstalledBrowser[] = [];
  for (const browser of BROWSERS) {
    checkAbort(signal);
    const paths =
      process.platform === "darwin"
        ? ["/Applications", join(homedir(), "Applications")].map((root) =>
            join(root, `${browser.mac}.app/Contents/MacOS`, browser.binary),
          )
        : process.platform === "win32"
          ? [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env["ProgramFiles(x86)"]]
              .filter((root): root is string => !!root)
              .flatMap((root) => browser.windows.map((relative) => join(root, relative)))
          : (process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin")
              .split(delimiter)
              .filter((root) => root.startsWith("/"))
              .flatMap((root) => browser.linux.map((name) => join(root, name)));
    for (const executable of paths) {
      // Sandboxed launchers cannot necessarily expose a host-readable profile.
      // Skip them and let the existing in-app flow handle that installation.
      if (process.platform === "linux" && /\/snap\/|\/flatpak\//.test(executable)) continue;
      try {
        await access(executable, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        found.push({ id: browser.id, name: browser.name, executable });
        break;
      } catch {
        /* next installation */
      }
    }
  }
  return prioritizeBrowsers(found, preferred);
}
