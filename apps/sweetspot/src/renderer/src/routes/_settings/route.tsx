import {
	RiArrowRightSLine,
	RiChatQuoteLine,
	RiCodeSSlashLine,
	RiComputerLine,
	RiInformationLine,
	RiKey2Line,
	RiLiveLine,
	RiMusic2Line,
	RiPaletteLine,
	RiServerLine,
	RiSettings3Line,
} from "@remixicon/react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { type CSSProperties, Suspense, useEffect, useRef, useState } from "react";
import { ControlBar } from "@/components/control-bar";
import { SettingsPageHeading } from "@/components/settings-page-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@/components/ui/sidebar";
import { SpinnerPage } from "@/components/ui/spinner";
import { useUpdater } from "@/hooks/use-updater";
import "@/styles/settings.css";
import { searchSettings, settingsGroups, type SettingsDestination } from "@/lib/settings-navigation";

export const Route = createFileRoute("/_settings")({ component: SettingsLayout });

const icons = {
	settings: RiSettings3Line,
	palette: RiPaletteLine,
	code: RiCodeSSlashLine,
	display: RiComputerLine,
	music: RiMusic2Line,
	lyrics: RiChatQuoteLine,
	cast: RiLiveLine,
	server: RiServerLine,
	key: RiKey2Line,
	info: RiInformationLine,
};

function SettingsLayout() {
	const { updateInfo, downloaded } = useUpdater();
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const searchInput = useRef<HTMLInputElement>(null);
	const navigation = useRef<HTMLElement>(null);
	const searching = query.trim().length > 0;
	const results = searchSettings(query);

	useEffect(() => {
		const revealActivePage = () => {
			if (!searching) navigation.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
		};
		revealActivePage();
		window.addEventListener("resize", revealActivePage);
		return () => window.removeEventListener("resize", revealActivePage);
	}, [pathname, searching]);

	useEffect(() => {
		document.title = "Sweet Spot — Settings";
	}, []);
	// Menus elsewhere in the app can navigate this window while search is open.
	useEffect(() => {
		setQuery("");
	}, [pathname]);
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
				event.preventDefault();
				searchInput.current?.focus();
				searchInput.current?.select();
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const openPage = (to: SettingsDestination) => {
		setQuery("");
		if (to !== pathname) void navigate({ to });
	};

	return (
		<div className="settings-shell absolute inset-0 flex h-full flex-col overflow-hidden bg-background">
			<ControlBar title="Settings" />
			<SidebarProvider className="min-h-0 flex-1" defaultOpen style={{ "--sidebar-width": "14rem" } as CSSProperties}>
				<Sidebar collapsible="none" className="border-r border-sidebar-border">
					<SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
						<Input
							ref={searchInput}
							type="search"
							aria-label="Search settings"
							placeholder="Search settings…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") setQuery("");
								if (event.key === "Enter" && searching && results[0]) openPage(results[0].to);
							}}
						/>
					</SidebarHeader>
					<SidebarContent>
						<nav ref={navigation} aria-label="Settings categories">
							{settingsGroups.map((group) => (
								<SidebarGroup key={group.label} className="py-1">
									<SidebarGroupLabel className="h-6">{group.label}</SidebarGroupLabel>
									<SidebarGroupContent>
										<SidebarMenu className="gap-0">
											{group.pages.map((page) => {
												const Icon = icons[page.icon];
												return (
													<SidebarMenuItem key={page.to}>
														<SidebarMenuButton
															className="h-7"
															isActive={!searching && pathname === page.to}
															aria-current={!searching && pathname === page.to ? "page" : undefined}
															onClick={() => openPage(page.to)}
														>
															<Icon aria-hidden="true" />
															<span>{page.label}</span>
															{page.to === "/about" && updateInfo && (
																<>
																	<span aria-hidden="true" className="ml-auto size-1.5 shrink-0 rounded-full bg-green-500" />
																	<span className="sr-only">{downloaded ? "Update ready to install" : "Update available"}</span>
																</>
															)}
														</SidebarMenuButton>
													</SidebarMenuItem>
												);
											})}
										</SidebarMenu>
									</SidebarGroupContent>
								</SidebarGroup>
							))}
						</nav>
					</SidebarContent>
				</Sidebar>
				<SidebarInset className="min-h-0 min-w-0 overflow-hidden" aria-label="Settings content">
					{searching ? (
						<ScrollArea className="h-full">
							<div className="settings-page mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pb-16">
								<header className="space-y-2">
									<h1 className="settings-search-heading text-2xl font-semibold tracking-tight">Search settings</h1>
									<p role="status" className="text-sm text-muted-foreground">
										{results.length} {results.length === 1 ? "result" : "results"} for “{query.trim()}”
									</p>
								</header>
								{results.length ? (
									<ul className="divide-y rounded-xl border">
										{results.map((page) => (
											<li key={page.to}>
												<button
													type="button"
													onClick={() => openPage(page.to)}
													className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
												>
													<div className="min-w-0 flex-1">
														<p className="text-xs text-muted-foreground">{page.group}</p>
														<p className="mt-1 text-sm font-medium">{page.label}</p>
														<p className="mt-1 text-xs text-muted-foreground">{page.description}</p>
													</div>
													<RiArrowRightSLine className="size-4 shrink-0" aria-hidden="true" />
												</button>
											</li>
										))}
									</ul>
								) : (
									<div className="rounded-xl border border-dashed p-6">
										<p className="text-sm font-medium">No settings found</p>
										<p className="mt-2 text-sm text-muted-foreground">Try a feature such as volume, shortcuts, themes, or updates.</p>
									</div>
								)}
								<Button
									variant="outline"
									className="self-start"
									onClick={() => {
										setQuery("");
										searchInput.current?.focus();
									}}
								>
									Clear search
								</Button>
							</div>
						</ScrollArea>
					) : pathname.startsWith("/api-integrations") ? (
						<Outlet />
					) : (
						<ScrollArea key={pathname} className="h-full">
							<div className="settings-page mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 pb-32">
								<SettingsPageHeading />
								<Suspense fallback={<SpinnerPage />}>
									<Outlet />
								</Suspense>
							</div>
						</ScrollArea>
					)}
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
