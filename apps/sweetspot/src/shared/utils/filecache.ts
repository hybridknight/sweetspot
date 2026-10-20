import { createCacheEncryption } from "@main/lib/store/createYmlStore";
import { createHash } from "node:crypto";
import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const cachePath = join(app.getPath("userData"), "cache");
if (!existsSync(cachePath)) mkdirSync(cachePath);
export async function cacheWithFile<T>(fn: () => Promise<T>, key: string): Promise<T> {
	const enc = createCacheEncryption("release-cache");
	const cacheFile = join(cachePath, createHash("sha256").update(key).digest("hex") + ".v2.ytm");
	if (existsSync(cacheFile)) {
		const cached = enc.decrypt<T>(readFileSync(cacheFile, "utf8"));
		if (cached !== null) return cached;
	}
	const result = (await fn()) as T;
	writeFileSync(cacheFile, enc.encrypt(result), { mode: 0o600 });
	return result;
}
