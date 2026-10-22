import { publicProcedure, router } from "@shared/trpc/trpc";
import { z } from "zod";
import { controlSignIn, getSignInStatus } from "./state";

export const signInRouter = router({
  status: publicProcedure.query(() => getSignInStatus()),
  control: publicProcedure
    .input(z.object({ id: z.string().uuid(), action: z.enum(["cancel", "embedded", "retry"]) }))
    .mutation(({ ctx, input }) => {
      const sender = ctx.event.sender as { id?: number } | null;
      return controlSignIn(sender?.id ?? -1, input.id, input.action);
    }),
});
