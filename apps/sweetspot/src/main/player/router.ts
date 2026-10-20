import type { SkinQueueItem, SkinQueueSnapshot } from "@shared/skins/queue";
import { emptySpectrum, type SpectrumFrame } from "@shared/skins/spectrum";
import { BehaviorSubject } from "rxjs";
import { observable } from "@trpc/server/observable";
import type { WebContents } from "electron";
import { z } from "zod";
import { provider } from "@main/trpc/provider";
import { YtmClient } from "@main/ytm/ytm-client";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { BUILTIN_SKINS, resolveSkin } from "@shared/skins/builtins";
import {
  skinId,
  skinPackageSchema,
  validateSkinValues,
  type SkinPackage,
  type SkinValues,
} from "@shared/skins/schema";
import { playerMode } from "./mode";
import type { AppTrpcContext } from "@shared/trpc/context";
const stateKey = "playerSkins";
let previewOwner: number | null = null;
const previewState = new BehaviorSubject<{ id: string; values: SkinValues } | null>(null);
type SkinState = {
  selected: string;
  custom: SkinPackage[];
  preferences: Record<string, SkinValues>;
};
function read(ctx: AppTrpcContext): SkinState {
  const raw = provider(ctx, "settings").get(stateKey) as Partial<SkinState> | null;
  const custom = (Array.isArray(raw?.custom) ? raw.custom.slice(0, 24) : []).flatMap((s) => {
    const result = skinPackageSchema.safeParse(s);
    return result.success && !s.id.startsWith("builtin-") ? [result.data] : [];
  });
  const selected = resolveSkin(raw?.selected ?? "", custom).id;
  const preferences = Object.fromEntries(
    [...BUILTIN_SKINS, ...custom].map((s) => [
      s.id,
      validateSkinValues(s, raw?.preferences?.[s.id]),
    ]),
  );
  return { selected, custom, preferences };
}
function save(ctx: AppTrpcContext, state: SkinState) {
  const settings = provider(ctx, "settings");
  settings.set(stateKey, state);
  settings.saveToDrive();
  return state;
}
const bounds = z
  .object({
    x: z.number().finite().min(0).max(10000),
    y: z.number().finite().min(0).max(10000),
    width: z.number().finite().min(0).max(10000),
    height: z.number().finite().min(0).max(10000),
    pictureFrame: z.boolean().optional(),
  })
  .strict()
  .nullish();
export const playerRouter = router({
  mode: publicProcedure.query(() => playerMode().active),
  onMode: publicProcedure.subscription(() =>
    observable<boolean>((emit) => {
      const subscription = playerMode().modeChanges.subscribe((active) => emit.next(active));
      return () => subscription.unsubscribe();
    }),
  ),
  spectrum: publicProcedure.subscription(() =>
    observable<SpectrumFrame>((emit) => {
      let disconnect: (() => void) | undefined;
      const mode = playerMode().modeChanges.subscribe((active) => {
        disconnect?.();
        disconnect = undefined;
        if (active) disconnect = YtmClient.subscribeSpectrum((frame) => emit.next(frame));
        else emit.next(emptySpectrum());
      });
      return () => {
        mode.unsubscribe();
        disconnect?.();
      };
    }),
  ),
  openAppearance: publicProcedure.mutation(async ({ ctx }) => {
    const win = await provider(ctx, "app").openSettingsWindow("/appearance/skins");
    if (!win) throw new Error("Could not open Appearance settings. Please try again.");
  }),
  onCatalog: publicProcedure.subscription(({ ctx }) =>
    observable<{
      selected: string;
      custom: SkinPackage[];
      preferences: Record<string, SkinValues>;
      builtins: SkinPackage[];
      hasSavedSize: boolean;
    }>((emit) => {
      const sub = provider(ctx, "settings").settingChanged.subscribe((ev) => {
        if (ev.key === stateKey) {
          const state = read(ctx);
          emit.next({
            ...state,
            builtins: BUILTIN_SKINS,
            hasSavedSize: playerMode().hasSavedSize(state.selected),
          });
        }
      });
      return () => sub.unsubscribe();
    }),
  ),
  onPreview: publicProcedure.subscription(() =>
    observable<{ id: string; values: SkinValues } | null>((emit) => {
      const sub = previewState.subscribe((value) => emit.next(value));
      return () => sub.unsubscribe();
    }),
  ),
  previewPreferences: publicProcedure
    .input(
      z
        .object({
          id: skinId,
          values: z.record(z.union([z.string().max(80), z.boolean(), z.number().finite()])),
        })
        .strict()
        .nullish(),
    )
    .mutation(({ ctx, input }) => {
      if (!input) {
        previewOwner = null;
        previewState.next(null);
        return;
      }
      const state = read(ctx),
        skin = resolveSkin(input.id, state.custom);
      if (skin.id !== input.id) throw new Error("Skin not found.");
      const sender = ctx.event?.sender as WebContents | undefined;
      if (sender && previewOwner !== sender.id) {
        const ownerId = sender.id;
        previewOwner = ownerId;
        sender.once("destroyed", () => {
          if (previewOwner === ownerId) {
            previewOwner = null;
            previewState.next(null);
          }
        });
      }
      previewState.next({ id: skin.id, values: validateSkinValues(skin, input.values) });
    }),
  enter: publicProcedure.mutation(async () => {
    await playerMode().enter();
    return true;
  }),
  fullMode: publicProcedure.mutation(() => playerMode().full()),
  catalog: publicProcedure.query(({ ctx }) => {
    const state = read(ctx);
    return {
      ...state,
      builtins: BUILTIN_SKINS,
      hasSavedSize: playerMode().hasSavedSize(state.selected),
    };
  }),
  select: publicProcedure.input(skinId).mutation(({ ctx, input }) => {
    const state = read(ctx);
    if (![...BUILTIN_SKINS, ...state.custom].some((s) => s.id === input))
      throw new Error("Skin not found.");
    playerMode().selectSkin({ id: input, width: resolveSkin(input, state.custom).layout.width });
    return save(ctx, { ...state, selected: input });
  }),
  preferences: publicProcedure
    .input(
      z
        .object({
          id: skinId,
          values: z.record(z.union([z.string().max(80), z.boolean(), z.number().finite()])),
        })
        .strict(),
    )
    .mutation(({ ctx, input }) => {
      const state = read(ctx),
        skin = resolveSkin(input.id, state.custom);
      if (skin.id !== input.id) throw new Error("Skin not found.");
      return save(ctx, {
        ...state,
        preferences: { ...state.preferences, [skin.id]: validateSkinValues(skin, input.values) },
      });
    }),
  removeSkin: publicProcedure.input(skinId).mutation(({ ctx, input }) => {
    if (input.startsWith("builtin-")) throw new Error("Built-in skins cannot be removed.");
    const state = read(ctx);
    const preferences = { ...state.preferences };
    delete preferences[input];
    if (state.selected === input)
      playerMode().selectSkin({ id: BUILTIN_SKINS[0].id, width: BUILTIN_SKINS[0].layout.width });
    return save(ctx, {
      ...state,
      selected: state.selected === input ? BUILTIN_SKINS[0].id : state.selected,
      custom: state.custom.filter((s) => s.id !== input),
      preferences,
    });
  }),
  videoMode: publicProcedure
    .input(z.object({ enabled: z.boolean() }).strict().optional())
    .mutation(({ input }) => {
      if (!playerMode().active) return;
      return YtmClient.cmdTimed("api", "skinVideoMode", 3000, input?.enabled ?? true);
    }),
  resizeHeight: publicProcedure
    .input(z.number().finite().min(480).max(2400))
    .mutation(({ ctx, input }) => {
      if ((ctx.event.sender as { id?: number })?.id !== playerMode().senderId)
        throw new Error("Player layout belongs to the player window.");
      playerMode().resizeHeight(input);
    }),
  minimumHeight: publicProcedure
    .input(z.number().finite().min(480).max(2400))
    .mutation(({ ctx, input }) => {
      if ((ctx.event.sender as { id?: number })?.id !== playerMode().senderId)
        throw new Error("Player layout belongs to the player window.");
      playerMode().setMinimumHeight(input);
    }),
  // Wrap the flag: the IPC transport treats a bare false input as absent.
  transparency: publicProcedure
    .input(z.object({ enabled: z.boolean() }).strict())
    .mutation(({ ctx, input }) => {
      if ((ctx.event.sender as { id?: number })?.id !== playerMode().senderId)
        throw new Error("Transparency belongs to the player window.");
      playerMode().setTransparency(input.enabled);
    }),
  videoBounds: publicProcedure.input(bounds).mutation(async ({ ctx, input }) => {
    if ((ctx.event.sender as { id?: number })?.id !== playerMode().senderId)
      throw new Error("Video slots belong to the player window.");
    await playerMode().setVideo(input ?? null);
  }),
  videoDimensions: publicProcedure.query(() =>
    YtmClient.cmdTimed<{ width: number; height: number }>("api", "skinVideoDimensions", 2000),
  ),
  pin: publicProcedure.mutation(() => playerMode().pin()),
  minimize: publicProcedure.mutation(() => playerMode().minimize()),
  artistArtwork: publicProcedure
    .input(
      z
        .object({
          videoId: z.string().max(64),
          channelId: z.string().max(64),
          artist: z.string().max(512).optional(),
        })
        .strict(),
    )
    .query(({ input }) => YtmClient.cmdTimed<string | null>("api", "artistArtwork", 8000, input)),
  queue: publicProcedure.query(() =>
    YtmClient.cmdTimed<SkinQueueSnapshot>(
      "api",
      "playerQueue",
      3000,
    ),
  ),
  playQueue: publicProcedure
    .input(z.object({ id: z.string().max(200), revision: z.string().max(20000) }).strict())
    .mutation(({ input }) => YtmClient.cmdTimed("api", "playerQueuePlay", 3000, input)),
  moveQueue: publicProcedure
    .input(
      z
        .object({
          id: z.string().min(1).max(200),
          revision: z.string().max(20000),
          toIndex: z.number().int().min(0).max(1999),
        })
        .strict(),
    )
    .mutation(({ input }) =>
      YtmClient.cmdTimed<SkinQueueSnapshot>(
        "api",
        "playerQueueMove",
        3000,
        input,
      ),
    ),
  queueAction: publicProcedure
    .input(
      z
        .object({
          id: z.string().min(1).max(200),
          revision: z.string().max(20000),
          action: z.enum(["playNext", "remove"]),
        })
        .strict(),
    )
    .mutation(({ input }) =>
      YtmClient.cmdTimed<SkinQueueSnapshot>(
        "api",
        "playerQueueAction",
        3000,
        input,
      ),
    ),
});
export type PlayerQueueItem = SkinQueueItem;
