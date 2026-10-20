/** Client metadata used by the MCP setup form and the existing pairing service. */
export function createMcpClientInput(appName: string) {
	return {
		appId: `mcp${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
		appName: appName.trim(),
		appVersion: "1.0.0",
	};
}
