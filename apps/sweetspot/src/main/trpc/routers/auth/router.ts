import type { AuthClientRecord, PendingAuthRequest } from "@main/auth";
import { provider } from "@main/trpc/provider";
import { publicProcedure, router } from "@shared/trpc/trpc";
import { observable } from "@trpc/server/observable";
import { z } from "zod";

type SafeClient = Omit<AuthClientRecord, "token">;

function toSafeClient(client: AuthClientRecord): SafeClient {
	const { token: _token, ...rest } = client;
	return rest;
}

const createClientInput = z.object({
	appId: z.string().min(2).max(32),
	appName: z.string().min(2).max(48),
	appVersion: z.string().optional(),
});

export const authRouter = router({
	status: publicProcedure.query(async ({ ctx }) => {
		const auth = provider(ctx, "auth");
		const settings = provider(ctx, "settings").instance;
		return {
			authRequired: settings.api?.authRequired === true,
			pending: auth.getPendingAuth(),
			clients: (await auth.getClients()).map(toSafeClient),
		};
	}),
	pending: publicProcedure.query(({ ctx }) => provider(ctx, "auth").getPendingAuth()),
	clients: publicProcedure.query(async ({ ctx }) => (await provider(ctx, "auth").getClients()).map(toSafeClient)),
	approve: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
		const client = await provider(ctx, "auth").approveAuth(input.id);
		return client ? toSafeClient(client) : null;
	}),
	deny: publicProcedure.input(z.object({ id: z.string() })).mutation(({ ctx, input }) => provider(ctx, "auth").denyAuth(input.id)),
	revoke: publicProcedure.input(z.object({ appId: z.string() })).mutation(({ ctx, input }) => provider(ctx, "auth").revokeClient(input.appId)),
	revokeAll: publicProcedure.mutation(async ({ ctx }) => {
		await provider(ctx, "auth").revokeAllClients();
		return true;
	}),
	create: publicProcedure.input(createClientInput).mutation(async ({ ctx, input }) => {
		const client = await provider(ctx, "auth").createManualClient({
			appId: input.appId,
			appName: input.appName,
			appVersion: input.appVersion,
		});
		return { client: toSafeClient(client), token: client.token };
	}),
	revealToken: publicProcedure.input(z.object({ appId: z.string() })).mutation(async ({ ctx, input }) => {
		return provider(ctx, "auth").getClientToken(input.appId);
	}),
	onPending: publicProcedure.subscription(({ ctx }) => {
		const auth = provider(ctx, "auth");
		return observable<PendingAuthRequest | null>((emit) => {
			const sub = auth.pendingAuth$.subscribe((value) => emit.next(value));
			emit.next(auth.getPendingAuth()[0] ?? null);
			return () => sub.unsubscribe();
		});
	}),
	onClients: publicProcedure.subscription(({ ctx }) => {
		const auth = provider(ctx, "auth");
		return observable<SafeClient[]>((emit) => {
			const sub = auth.clients$.subscribe((clients) => emit.next(clients.map(toSafeClient)));
			let active = true;
			void auth.getClients().then((clients) => {
				if (active) emit.next(clients.map(toSafeClient));
			}, (error) => { if (active) emit.error(error); });
			return () => { active = false; sub.unsubscribe(); };
		});
	}),
});
