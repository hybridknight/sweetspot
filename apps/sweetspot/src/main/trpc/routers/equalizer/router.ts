import { randomUUID } from "node:crypto";
import { provider } from "@main/trpc/provider";
import { YtmClient } from "@main/ytm/ytm-client";
import {
  eqGainsSchema,
  eqPlaybackSchema,
  eqPresetNameSchema,
  readEqSettings,
  saveEqPreset,
  type EqSettings,
  type EqStatus,
} from "@shared/equalizer";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";

export const equalizerRouter = router({
  preview: publicProcedure
    .input(eqPlaybackSchema)
    .mutation(async ({ input }): Promise<EqStatus> => {
      return YtmClient.cmdTimed<EqStatus>("equalizer", "preview", 2500, input);
    }),
  status: publicProcedure.query(async (): Promise<EqStatus> => {
    try {
      return await YtmClient.cmdTimed<EqStatus>("equalizer", "status", 2500);
    } catch {
      return {
        state: "unavailable",
        message: "Player is loading. Equalizer will reconnect when playback is ready.",
        sampleRate: 48000,
        headroomDb: 0,
      };
    }
  }),
  commit: publicProcedure.input(eqPlaybackSchema).mutation(({ ctx, input }): EqSettings => {
    const settings = provider(ctx, "settings");
    const next = { ...readEqSettings(settings.get("equalizer")), ...input };
    settings.set("equalizer", next);
    return next;
  }),
  savePreset: publicProcedure
    .input(
      z.object({
        name: eqPresetNameSchema,
        gains: eqGainsSchema,
        replaceId: z.string().optional(),
      }),
    )
    .mutation(({ ctx, input }): EqSettings => {
      const settings = provider(ctx, "settings");
      const next = saveEqPreset(
        readEqSettings(settings.get("equalizer")),
        { id: input.replaceId ?? `custom-${randomUUID()}`, name: input.name, gains: input.gains },
        input.replaceId,
      );
      settings.set("equalizer", next);
      return next;
    }),
  renamePreset: publicProcedure
    .input(z.object({ id: z.string(), name: eqPresetNameSchema }))
    .mutation(({ ctx, input }): EqSettings => {
      const settings = provider(ctx, "settings");
      const current = readEqSettings(settings.get("equalizer"));
      const preset = current.presets.find((p) => p.id === input.id);
      if (!preset) throw new Error("This custom preset no longer exists.");
      const next = saveEqPreset(current, { ...preset, name: input.name }, input.id);
      settings.set("equalizer", next);
      return next;
    }),
  deletePreset: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }): EqSettings => {
      const settings = provider(ctx, "settings");
      const current = readEqSettings(settings.get("equalizer"));
      const next = { ...current, presets: current.presets.filter((p) => p.id !== input.id) };
      settings.set("equalizer", next);
      return next;
    }),
});
