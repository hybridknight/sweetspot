import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { createMcpClientInput } from "@shared/mcp-client";
import { toast } from "sonner";
import { SettingsCheckbox } from "@/components/settings-checkbox";
import { SettingsInlineEditor } from "@/components/settings-inline-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/_settings/api-integrations/mcp")({
	component: McpSettingsPage,
});

function McpSettingsPage() {
	const status = trpc.api.mcpStatus.useQuery(undefined, { refetchInterval: 2000 });
	const clients = trpc.auth.clients.useQuery();
	const create = trpc.auth.create.useMutation();
	const reveal = trpc.auth.revealToken.useMutation();
	const restart = trpc.api.restartMcp.useMutation({
		onSuccess: () => {
			void status.refetch();
		},
	});
	const [clientName, setClientName] = useState("My AI assistant");
	const [clientId, setClientId] = useState("");
	const [format, setFormat] = useState("cursor");
	const endpoint = `http://127.0.0.1:${status.data?.port ?? 13092}/mcp`;
	const busy = create.isLoading || reveal.isLoading;
	const config = (token: string) =>
		JSON.stringify(
			format === "vscode"
				? {
						servers: {
							sweetspot: {
								type: "http",
								url: endpoint,
								headers: { Authorization: `Bearer ${token}` },
							},
						},
					}
				: {
						mcpServers: {
							sweetspot: { url: endpoint, headers: { Authorization: `Bearer ${token}` } },
						},
					},
			null,
			2,
		);
	const copy = async (value: string, message: string) => {
		try {
			await navigator.clipboard.writeText(value);
			toast.success(message);
		} catch {
			toast.error("Could not copy. Check clipboard access and try again.");
		}
	};
	const createClient = async () => {
		try {
			const result = await create.mutateAsync(createMcpClientInput(clientName));
			setClientId(result.client.appId);
			await clients.refetch();
			toast.success("Client created. Copy its connection config below.");
		} catch (error) {
			toast.error(error instanceof Error ? `Could not create client: ${error.message}` : "Could not create client. Try again.");
		}
	};
	const copyConfig = async () => {
		try {
			const token = await reveal.mutateAsync({ appId: clientId });
			if (!token) throw new Error("Client no longer exists. Select or create another client.");
			await copy(config(token), "Connection config copied. Keep it private: it contains your client token.");
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Could not load client token.");
		}
	};
	const selectClass = "h-9 w-full rounded-md border bg-background px-3 text-sm";
	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardHeader>
					<CardTitle className="flex flex-wrap items-center gap-2">
						Your music, in the conversation <Badge variant="outline">MCP · Experimental</Badge>
					</CardTitle>
					<CardDescription>
						Let an AI assistant see what’s playing, check your queue, and control music when you allow it. Sweet Spot must stay open on this computer.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-3 sm:grid-cols-3">
						{["“What’s playing right now?”", "“What’s coming up in my queue?”", "“Pause the music and set volume to 25%.”"].map((text) => (
							<p key={text} className="rounded-lg bg-muted p-3 text-sm">
								{text}
							</p>
						))}
					</div>
					<SettingsCheckbox configKey="mcp.enabled" description="Starts a server reachable only on this computer. A client token is always required.">
						Enable MCP server
					</SettingsCheckbox>
					<div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm">
						<Badge variant={status.data?.running ? "default" : "secondary"}>
							{status.isError
								? "Status unavailable"
								: !status.data
									? "Checking…"
									: status.data.running
										? "Ready to connect"
										: status.data.error
											? "Needs attention"
											: status.data.enabled
												? "Starting…"
												: "Off"}
						</Badge>
						<code className="break-all text-xs">{endpoint}</code>
						<Button size="sm" variant="outline" onClick={() => void copy(endpoint, "Server URL copied")}>
							Copy URL
						</Button>
					</div>
					{status.data?.error && (
						<div role="alert" className="space-y-2 text-sm">
							<p className="text-destructive">{status.data.error}</p>
							<Button variant="outline" size="sm" disabled={restart.isLoading} onClick={() => restart.mutate()}>
								Try again
							</Button>
						</div>
					)}
					<SettingsCheckbox
						configKey="mcp.allowControl"
						description="Off: assistants can only read your current song and queue. On: every paired client can also play, pause, skip, seek, change volume, and add songs. Reconnect your assistant after changing this."
					>
						Allow playback control
					</SettingsCheckbox>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Connect in three steps</CardTitle>
					<CardDescription>Use a desktop MCP client that supports Streamable HTTP and bearer headers. Cloud-only assistants cannot reach this local server.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<section className="space-y-3" aria-labelledby="mcp-step-one">
						<h3 id="mcp-step-one" className="font-medium">
							1. Give your assistant a client token
						</h3>
						<p className="text-sm text-muted-foreground">Create a separate client for each assistant so you can revoke its access later.</p>
						<label className="block space-y-2 text-sm">
							<span>Client name</span>
							<Input maxLength={48} value={clientName} onChange={(event) => setClientName(event.target.value)} />
						</label>
						<Button disabled={busy || clientName.trim().length < 2} onClick={() => void createClient()}>
							{create.isLoading ? "Creating…" : "Create client"}
						</Button>
					</section>
					<section className="space-y-3" aria-labelledby="mcp-step-two">
						<h3 id="mcp-step-two" className="font-medium">
							2. Add Sweet Spot to your assistant
						</h3>
						<label className="block space-y-2 text-sm">
							<span>Paired client</span>
							<select className={selectClass} value={clientId} onChange={(event) => setClientId(event.target.value)}>
								<option value="">Choose a client…</option>
								{clients.data?.map((client) => (
									<option value={client.appId} key={client.appId}>
										{client.appName}
									</option>
								))}
							</select>
						</label>
						{clients.isError && (
							<p role="alert" className="text-sm text-destructive">
								Could not load paired clients.{" "}
								<button className="underline" onClick={() => void clients.refetch()}>
									Try again
								</button>
							</p>
						)}
						<label className="block space-y-2 text-sm">
							<span>Config format</span>
							<select className={selectClass} value={format} onChange={(event) => setFormat(event.target.value)}>
								<option value="cursor">Cursor / mcpServers</option>
								<option value="vscode">VS Code / .vscode/mcp.json</option>
							</select>
						</label>
						<pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs" aria-label="Connection config preview with placeholder token">
							{config("YOUR_CLIENT_TOKEN")}
						</pre>
						<Button disabled={!status.data?.running || !clients.data?.some((client) => client.appId === clientId) || busy} onClick={() => void copyConfig()}>
							{reveal.isLoading ? "Preparing…" : "Copy config with token"}
						</Button>
						<p className="text-sm text-muted-foreground">
							{format === "vscode"
								? "Paste into .vscode/mcp.json, then start the server from the MCP server list."
								: "Paste into your assistant’s MCP configuration (Cursor: .cursor/mcp.json), then enable Sweet Spot."}{" "}
							The copied config contains a private token. Keep it out of shared repositories.
						</p>
					</section>
					<section className="space-y-2" aria-labelledby="mcp-step-three">
						<h3 id="mcp-step-three" className="font-medium">
							3. Try “What’s playing in Sweet Spot?”
						</h3>
						<p className="text-sm text-muted-foreground">
							Open YouTube Music and play a song first. For playback commands, turn on Allow playback control. To play or queue a specific song, give your assistant a YouTube link;
							music search is not available.
						</p>
						<Link className="text-sm underline" to="/api-integrations/authentication">
							Manage or revoke paired clients →
						</Link>
					</section>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>Connection help</CardTitle>
					<CardDescription>Settings take effect automatically. Changing the port restarts the server.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<SettingsInlineEditor
						configKey="mcp.port"
						type="number"
						defaultValue={13092}
						label="MCP port"
						hint="Choose 9999–39999, different from the Local API port. Copy your config again after changing it."
						min={9999}
						max={39999}
						rules={[{ kind: "number", min: 9999, max: 39999, integer: true }]}
						parse={Number}
					/>
					<details className="text-sm">
						<summary className="cursor-pointer font-medium">My assistant won’t connect</summary>
						<ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
							<li>Check that the status above says Ready to connect and Sweet Spot is open.</li>
							<li>For unauthorized errors, select a current client and copy its config again.</li>
							<li>Use Streamable HTTP with bearer headers. Legacy SSE and cloud-only connections are unsupported.</li>
							<li>After changing permissions, reconnect the assistant to refresh its tools.</li>
							<li>If playback is unavailable, sign in to YouTube Music and start a song manually.</li>
						</ul>
					</details>
					<a className="inline-block text-sm underline" href="https://sweetspot.bkk.ooo/docs/integrations/mcp" target="_blank" rel="noreferrer">
						Read the MCP guide ↗
					</a>
				</CardContent>
			</Card>
		</div>
	);
}
