import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";

export const chromecastRouter = router({
	pending: publicProcedure.query(({ ctx }) => provider(ctx, "chromecast").listPending()),
	select: publicProcedure.input(z.object({ id: z.string().nullable() })).mutation(({ ctx, input }) => {
		return provider(ctx, "chromecast").selectReceiver(input.id);
	}),
});
