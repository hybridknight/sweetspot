import { PlaybackTransitionSettings } from "../src/renderer/src/components/playback-transition-settings";
import { ConsistentVolumeSetting } from "../src/renderer/src/components/consistent-volume-setting";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { EqualizerPanel } from "../src/renderer/src/components/equalizer-panel";
import { queryClient, trpc, trpcClient } from "../src/renderer/src/lib/trpc";

function Panel({ stable = false }: { stable?: boolean }) {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {stable ? (
          <div className="flex flex-col gap-6">
            <PlaybackTransitionSettings />
            <ConsistentVolumeSetting />
          </div>
        ) : (
          <EqualizerPanel />
        )}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
const root = createRoot(document.getElementById("app")!);
root.render(
  <StrictMode>
    <Panel stable />
  </StrictMode>,
);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
async function until(predicate: () => boolean, message: string) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await delay(50);
  }
  throw new Error(message);
}
function field(label: string): HTMLInputElement | HTMLSelectElement {
  const element = [...document.querySelectorAll("label")].find(
    (item) =>
      [...item.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join("")
        .trim() === label,
  );
  if (!element?.htmlFor) throw new Error(`Missing label ${label}`);
  return document.getElementById(element.htmlFor) as HTMLInputElement | HTMLSelectElement;
}
function input(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
async function click(text: string) {
  const button = [...document.querySelectorAll("button")].find((item) => item.textContent === text);
  check(!!button && !button!.disabled, `Button unavailable: ${text}`);
  button!.click();
  await delay(50);
}
async function run() {
  await until(
    () => !!document.querySelector('[role="switch"]:not([disabled])'),
    "Consistent volume setting failed to load",
  );
  const namedSwitch = (name: string) => {
    const label = [...document.querySelectorAll("label")].find((item) => item.textContent === name);
    if (!label) throw new Error(`Missing setting label ${name}`);
    return label
      .closest('[data-slot="field"]')!
      .querySelector('[role="switch"]') as HTMLButtonElement;
  };
  await until(
    () => document.querySelectorAll('[role="switch"]:not([disabled])').length === 3,
    "Playback settings failed to load",
  );
  const smooth = namedSwitch("Smooth play and pause");
  const songs = namedSwitch("Song fades");
  check(smooth.getAttribute("aria-checked") === "true", "Smooth transport was not on by default");
  check(songs.getAttribute("aria-checked") === "false", "Song fades should default off");
  smooth.click();
  songs.click();
  await until(
    () => !!document.querySelector('input[aria-label="Song fade duration"]'),
    "Song duration control did not appear",
  );
  input(
    document.querySelector('input[aria-label="Song fade duration"]') as HTMLInputElement,
    "2.5",
  );
  await delay(400);
  const transitions = (await trpcClient.query("settings.get", {
    key: "player.playbackTransitions",
  })) as any;
  check(
    transitions.smoothPlayPause === false &&
      transitions.songFades === true &&
      transitions.songFadeSeconds === 2.5,
    "Transition settings did not persist together",
  );
  songs.click();
  await until(
    () => !document.querySelector('input[aria-label="Song fade duration"]'),
    "Disabled song fades still showed duration",
  );
  songs.click();
  await delay(400);
  const stableSwitch = namedSwitch("Consistent volume");
  check(
    stableSwitch.getAttribute("aria-checked") === "true",
    "Consistent volume was not enabled by default",
  );
  check(
    !!stableSwitch.getAttribute("aria-labelledby"),
    "Consistent volume switch has no accessible label",
  );
  stableSwitch.click();
  await until(
    () => stableSwitch.getAttribute("aria-checked") === "false",
    "Consistent volume toggle failed",
  );
  await delay(400);
  check(
    (await trpcClient.query("settings.get", { key: "player.stableVolumeEnabled" })) === false,
    "Off preference did not persist",
  );
  stableSwitch.click();
  await delay(400);
  check(
    (await trpcClient.query("settings.get", { key: "player.stableVolumeEnabled" })) === true,
    "On preference did not persist",
  );
  stableSwitch.click();
  await delay(400);
  root.render(
    <StrictMode>
      <Panel />
    </StrictMode>,
  );

  await until(
    () => !!document.querySelector("fieldset:not([disabled])"),
    "Panel failed to load through IPC",
  );
  check(document.querySelectorAll('input[type="range"]').length === 10, "Missing band controls");
  const numeric = document.querySelector('input[type="number"]') as HTMLInputElement;
  numeric.focus();
  input(numeric, "");
  await delay(10);
  input(numeric, "-2.3");
  await delay(10);
  numeric.blur();
  await delay(50);
  check(numeric.value === "-2.3", "Precise negative numeric gain could not be entered");
  const enabled = document.querySelector('[role="switch"]') as HTMLButtonElement;
  enabled.click();
  await until(() => enabled.getAttribute("aria-checked") === "true", "Enable switch failed");
  await until(
    () => document.body.textContent!.includes("Waiting for local playback."),
    "Enable did not reach page-world audio controller",
  );
  input(field("Preset"), "bass-boost");
  await delay(100);
  check(
    (document.querySelector('input[type="range"]') as HTMLInputElement).value === "3",
    "Built-in preset did not apply",
  );
  input(field("Save your curve"), "Desk speakers");
  await delay(30);
  await click("Save new preset");
  await until(() => document.body.textContent!.includes("Preset saved."), "Save did not finish");
  check(
    (field("Preset") as HTMLSelectElement).selectedOptions[0].text === "Desk speakers",
    "Saved preset is not selected",
  );
  await click("Rename");
  input(field("Rename preset"), "Evening");
  await delay(30);
  await click("Rename");
  await until(() => document.body.textContent!.includes("Preset renamed."), "Rename failed");
  const firstBand = document.querySelector('input[type="range"]') as HTMLInputElement;
  input(firstBand, "1.5");
  await delay(50);
  check(
    (field("Preset") as HTMLSelectElement).value === "custom",
    "Modified preset did not become Custom",
  );
  await click("Update “Evening”");
  await until(() => document.body.textContent!.includes("Preset updated."), "Update failed");
  await click("Delete");
  await until(() => document.body.textContent!.includes("Preset deleted."), "Delete failed");
  check(
    (document.querySelector('input[type="range"]') as HTMLInputElement).value === "1.5",
    "Delete changed current sound",
  );
  await click("Undo deletion of “Evening”");
  await until(() => document.body.textContent!.includes("Preset restored."), "Undo failed");
  input(field("Save your curve"), " evening ");
  await delay(30);
  await click("Save new preset");
  await until(() => !!document.querySelector('[role="alert"]'), "Duplicate name was not rejected");
  check(
    document.querySelector('[role="alert"]')!.textContent!.includes("already exists"),
    "Wrong duplicate-name error",
  );
  // An edit immediately followed by unmount must be committed, including under StrictMode.
  input(document.querySelector('input[type="range"]') as HTMLInputElement, "2.5");
  await delay(5);
  root.unmount();
  await delay(500);
  const saved = (await trpcClient.query("settings.get", { key: "equalizer" })) as {
    gains: number[];
    presets: { name: string; gains: number[] }[];
  };
  check(saved.gains[0] === 2.5, "Closing panel lost final edit");
  check((saved as any).enabled === true, "Enable state did not persist");
  check(
    saved.presets.length === 1 &&
      saved.presets[0].name === "Evening" &&
      saved.presets[0].gains[0] === 1.5,
    "Saved preset mutated with current curve",
  );
  return {
    playbackTransitionSettings: "defaults, switches, duration and persistence passed",
    consistentVolumeSetting: "default on; off/on persistence and accessibility passed",
    controls: 10,
    builtInApply: "passed",
    customPresetCrudAndUndo: "passed",
    duplicateName: "passed",
    closeFlush: "passed",
    saved,
  };
}
(window as Window & { runEqualizerUiChecks?: typeof run }).runEqualizerUiChecks = run;
