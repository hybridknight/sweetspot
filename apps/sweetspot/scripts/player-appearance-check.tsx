import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient, queryClient } from "../src/renderer/src/lib/trpc";
import { PlayerSkinSettingsPage } from "../src/renderer/src/routes/_settings/appearance/skins";
createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <PlayerSkinSettingsPage />
    </QueryClientProvider>
  </trpc.Provider>,
);
