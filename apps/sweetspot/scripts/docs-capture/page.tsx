import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient, queryClient } from "../../src/renderer/src/lib/trpc";
import { PlayerSkinSettingsPage } from "../../src/renderer/src/routes/_settings/appearance/skins";
import { Route as General } from "../../src/renderer/src/routes/_settings/player/general";
import { Route as Equalizer } from "../../src/renderer/src/routes/_settings/player/equalizer";
import { Route as Lyrics } from "../../src/renderer/src/routes/_settings/player/lyrics";
import { Route as Themes } from "../../src/renderer/src/routes/_settings/appearance/themes";
import { Route as Display } from "../../src/renderer/src/routes/_settings/appearance/display";
import { Route as Generic } from "../../src/renderer/src/routes/_settings/index";
import { Route as Tray } from "../../src/renderer/src/routes/trayview";
import { Route as Authentication } from "../../src/renderer/src/routes/_settings/api-integrations/authentication";
import { Route as Api } from "../../src/renderer/src/routes/_settings/api-integrations/api";
import { Route as Player } from "../../src/renderer/src/routes/skin-player";

const key = new URLSearchParams(location.search).get("screen") ?? "skins";
const pages: Record<string, any> = {
  tray: Tray.options.component,
  authentication: Authentication.options.component,
  api: Api.options.component,
  skins: PlayerSkinSettingsPage,
  playback: General.options.component,
  equalizer: Equalizer.options.component,
  lyrics: Lyrics.options.component,
  themes: Themes.options.component,
  display: Display.options.component,
  generic: Generic.options.component,
  player: Player.options.component,
};
const Component = pages[key];
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <main
        style={
          key === "player" || key === "tray"
            ? {}
            : { maxWidth: 1160, margin: "0 auto", padding: 32 }
        }
      >
        <Component />
      </main>
    </QueryClientProvider>
  </trpc.Provider>,
);
