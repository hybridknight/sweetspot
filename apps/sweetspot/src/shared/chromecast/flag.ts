export const CHROMECAST_SETTING_KEY = "player.chromecastEnabled" as const;
export const CHROMECAST_ARGV_FLAG = "--sweetspot-chromecast";
export const CHROMECAST_ARGV_ENABLED = `${CHROMECAST_ARGV_FLAG}=1`;
export const CHROMECAST_ARGV_DISABLED = `${CHROMECAST_ARGV_FLAG}=0`;

export function isChromecastEnabledFromArgv(argv: readonly string[] = []): boolean {
	return argv.some((arg) => arg === CHROMECAST_ARGV_ENABLED || arg === `${CHROMECAST_ARGV_FLAG}`);
}

export function chromecastArgvFor(enabled: boolean): string {
	return enabled ? CHROMECAST_ARGV_ENABLED : CHROMECAST_ARGV_DISABLED;
}
