import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path → Themes under Appearance. */
export const Route = createFileRoute("/_settings/themes")({
	beforeLoad: () => {
		throw redirect({ to: "/appearance/themes" });
	},
	component: () => null,
});
