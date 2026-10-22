// @ts-nocheck — tRPC 10 + TS 5.x nested CreateRouterInner assignability false positive.
// `export type AppRouter = typeof appRouter` still infers full procedure I/O (not any).

import { playerRouter } from "@main/player/router";
import { signInRouter } from "@main/signIn/router";
import { apiRouter } from "@main/trpc/routers/api";
import { appServiceRouter } from "@main/trpc/routers/app";
import { authRouter } from "@main/trpc/routers/auth";
import { chromecastRouter } from "@main/trpc/routers/chromecast";
import { equalizerRouter } from "@main/trpc/routers/equalizer/router";
import { navigationRouter } from "@main/trpc/routers/navigation";
import { settingsRouter } from "@main/trpc/routers/settings";
import { themesRouter } from "@main/trpc/routers/themes";
import { trackRouter } from "@main/trpc/routers/track";
import { trayRouter } from "@main/trpc/routers/tray";
import { trayViewRouter } from "@main/trpc/routers/trayView";
import { updateRouter } from "@main/trpc/routers/update";
import { windowRouter } from "@main/trpc/routers/window";
import { router } from "@shared/trpc/trpc";

/**
 * Child routers (tRPC v10 docs):
 * https://trpc.io/docs/v10/server/merging-routers
 * Paths flatten to `track.current`, `settings.get`, …
 */
export const appRouter = router({
	signIn: signInRouter,
	track: trackRouter,
	player: playerRouter,
	settings: settingsRouter,
	equalizer: equalizerRouter,
	app: appServiceRouter,
	api: apiRouter,
	auth: authRouter,
	update: updateRouter,
	navigation: navigationRouter,
	tray: trayRouter,
	trayView: trayViewRouter,
	themes: themesRouter,
	chromecast: chromecastRouter,
	window: windowRouter,
});

export type AppRouter = typeof appRouter;
