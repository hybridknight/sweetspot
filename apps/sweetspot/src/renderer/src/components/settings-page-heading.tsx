import { useRouterState } from "@tanstack/react-router";
import { settingsPages } from "@/lib/settings-navigation";

export function SettingsPageHeading() {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const page = settingsPages.find((item) => item.to === pathname);
	if (!page) return null;
	return (
		<header className="settings-page-heading flex flex-col gap-2">
			<p className="text-xs font-medium text-muted-foreground">{page.group}</p>
			<h1 className="text-2xl font-semibold tracking-tight">{page.label}</h1>
			<p className="text-sm text-muted-foreground">{page.description}</p>
		</header>
	);
}
