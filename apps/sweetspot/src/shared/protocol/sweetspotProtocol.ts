/** Parsed `ssytm://` deep link. */
export type SweetspotParsed =
	| { type: "watch"; videoId: string; playlistId?: string }
	| { type: "playlist"; playlistId: string; play: boolean }
	| { type: "channel"; channelId?: string; handle?: string };

/** `ssytm://` share / deep-link helpers (shared main + renderer). */
export class SweetspotLink {
	static readonly scheme = "ssytm";

	private static readonly videoIdRe = /^[A-Za-z0-9_-]{11}$/;
	private static readonly playlistIdRe = /^[A-Za-z0-9_-]{2,128}$/;
	/** YouTube channel ids (`UC…`). */
	private static readonly channelIdRe = /^UC[A-Za-z0-9_-]{20,24}$/;
	/** `@handle` without leading @ (letters, digits, _ . -). */
	private static readonly handleRe = /^[A-Za-z0-9._-]{1,50}$/;

	/** Compact share: `ssytm://watch/<videoId>[/<playlistId>]` (skips radio/mix list ids). */
	static watch(videoId: string, playlistId?: string | null): string {
		const base = `${SweetspotLink.scheme}://watch/${videoId}`;
		const list = playlistId?.trim();
		return list && SweetspotLink.isWatchPlaylistContext(list) ? `${base}/${list}` : base;
	}

	/** `ssytm://playlist/<id>` or `ssytm://playlist/<id>/play` */
	static playlist(playlistId: string, play = false): string {
		const base = `${SweetspotLink.scheme}://playlist/${playlistId}`;
		return play ? `${base}/play` : base;
	}

	/** `ssytm://channel/<UC…>` or `ssytm://channel/@handle` */
	static channel(opts: { channelId?: string | null; handle?: string | null }): string | null {
		const id = opts.channelId?.trim();
		if (id && SweetspotLink.channelIdRe.test(id)) return `${SweetspotLink.scheme}://channel/${id}`;
		const handle = SweetspotLink.normalizeHandle(opts.handle);
		if (handle) return `${SweetspotLink.scheme}://channel/@${handle}`;
		return null;
	}

	/** Share link for a track; pulls non-radio `list=` from music canonical URL when present. */
	static share(videoId: string, musicUrl?: string | null): string {
		return SweetspotLink.watch(videoId, SweetspotLink.playlistFromMusicUrl(musicUrl));
	}

	/** Format any parsed link back to a compact or music-host `ssytm://` URL. */
	static format(link: SweetspotParsed): string {
		if (link.type === "watch") return SweetspotLink.watch(link.videoId, link.playlistId);
		if (link.type === "playlist") return SweetspotLink.playlist(link.playlistId, link.play);
		if (link.channelId) return `${SweetspotLink.scheme}://channel/${link.channelId}`;
		if (link.handle) return `${SweetspotLink.scheme}://music.youtube.com/@${link.handle}`;
		return `${SweetspotLink.scheme}://`;
	}

	/**
	 * User trick: replace `https://` → `ssytm://` on supported hosts.
	 * Works for music.youtube.com, youtube.com, youtu.be.
	 */
	static fromHttps(url: string): string | null {
		const raw = SweetspotLink.unquote(url);
		let parsed: URL;
		try {
			parsed = new URL(raw);
		} catch {
			return null;
		}
		if (!/^https?:$/i.test(parsed.protocol)) return null;
		if (!SweetspotLink.isConvertibleHost(parsed.hostname)) return null;
		// URL.protocol rejects unknown schemes (e.g. ssytm) in Node — swap by string.
		return raw.replace(/^https?:/i, `${SweetspotLink.scheme}:`);
	}

	/**
	 * Rewrite a convertible https URL to compact `ssytm://` (or null if unsupported).
	 * Used when intercepting YouTube Music “Copy link”.
	 */
	static toSweetspot(url: string): string | null {
		const link = SweetspotLink.resolve(url);
		return link ? SweetspotLink.format(link) : null;
	}

	/**
	 * Parse `ssytm://` or raw `https://` music/youtube/youtu.be URL into a link.
	 * Prefer for API `/nav/open` and tools that may pass either form.
	 */
	static resolve(url: string): SweetspotParsed | null {
		const raw = SweetspotLink.unquote(url);
		if (/^ssytm:\/\//i.test(raw)) return SweetspotLink.parse(raw);
		const asSweetspot = SweetspotLink.fromHttps(raw);
		return asSweetspot ? SweetspotLink.parse(asSweetspot) : null;
	}

	/**
	 * Parse deep link. Accepts compact paths and https→ssytm host mirrors
	 * (music.youtube.com, youtube.com, youtu.be).
	 * Invalid playlist on watch ignored; video still opens.
	 */
	static parse(url: string): SweetspotParsed | null {
		const raw = SweetspotLink.unquote(url);
		if (!/^ssytm:\/\//i.test(raw)) return null;

		let parsed: URL;
		try {
			parsed = new URL(raw);
		} catch {
			return null;
		}
		if (parsed.protocol.toLowerCase() !== `${SweetspotLink.scheme}:`) return null;

		if (SweetspotLink.isMusicHost(parsed.hostname)) {
			return SweetspotLink.parsePathHostUrl(parsed);
		}
		if (SweetspotLink.isYoutuBeHost(parsed.hostname)) {
			return SweetspotLink.parseYoutuBeUrl(parsed);
		}
		if (SweetspotLink.isYoutubeHost(parsed.hostname)) {
			return SweetspotLink.parsePathHostUrl(parsed);
		}

		const parts = [parsed.hostname, ...parsed.pathname.split("/")]
			.map((s) => SweetspotLink.decodeSegment(s.trim()))
			.filter(Boolean);
		const kind = parts[0]?.toLowerCase();
		if (!kind) return null;

		if (kind === "watch") {
			const videoId = parts[1];
			if (!videoId || !SweetspotLink.videoIdRe.test(videoId)) return null;
			const candidate = parts[2] || parsed.searchParams.get("list")?.trim() || undefined;
			const playlistId =
				candidate && SweetspotLink.isWatchPlaylistContext(candidate) ? candidate : undefined;
			return playlistId ? { type: "watch", videoId, playlistId } : { type: "watch", videoId };
		}

		if (kind === "playlist") {
			const playlistId = parts[1];
			if (!playlistId || !SweetspotLink.playlistIdRe.test(playlistId)) return null;
			const play = parts[2]?.toLowerCase() === "play" || parsed.searchParams.get("play") === "1";
			return { type: "playlist", playlistId, play };
		}

		if (kind === "channel") {
			const token = parts[1];
			if (!token) return null;
			if (token.startsWith("@")) {
				const handle = SweetspotLink.normalizeHandle(token);
				return handle ? { type: "channel", handle } : null;
			}
			if (SweetspotLink.channelIdRe.test(token)) return { type: "channel", channelId: token };
			return null;
		}

		return null;
	}

	/** First `ssytm://…` in process/second-instance argv. */
	static fromArgv(argv: readonly string[]): string | null {
		for (const arg of argv) {
			if (typeof arg !== "string") continue;
			const cleaned = SweetspotLink.unquote(arg);
			if (/^ssytm:\/\//i.test(cleaned)) return cleaned;
		}
		return null;
	}

	/** Browse id for a playlist page (`VL…` when needed). */
	static playlistBrowseId(playlistId: string): string {
		const id = playlistId.trim();
		if (!id) return id;
		if (/^(VL|OLAK|RD|MP)/i.test(id)) return id;
		return `VL${id}`;
	}

	private static decodeSegment(value: string): string {
		try {
			return decodeURIComponent(value);
		} catch {
			return value;
		}
	}

	private static isMusicHost(host: string): boolean {
		const h = host.trim().toLowerCase();
		return h === "music.youtube.com" || h === "www.music.youtube.com";
	}

	private static isYoutubeHost(host: string): boolean {
		const h = host.trim().toLowerCase();
		return h === "youtube.com" || h === "www.youtube.com" || h === "m.youtube.com";
	}

	private static isYoutuBeHost(host: string): boolean {
		const h = host.trim().toLowerCase();
		return h === "youtu.be" || h === "www.youtu.be";
	}

	/** Hosts that support the https→ssytm address-bar swap. */
	private static isConvertibleHost(host: string): boolean {
		return SweetspotLink.isMusicHost(host) || SweetspotLink.isYoutubeHost(host) || SweetspotLink.isYoutuBeHost(host);
	}

	/** `ssytm://youtu.be/<videoId>?list=…` */
	private static parseYoutuBeUrl(parsed: URL): SweetspotParsed | null {
		const segments = parsed.pathname
			.split("/")
			.map((s) => SweetspotLink.decodeSegment(s.trim()))
			.filter(Boolean);
		const videoId = segments[0]?.trim();
		if (!videoId || !SweetspotLink.videoIdRe.test(videoId)) return null;
		const list = parsed.searchParams.get("list")?.trim();
		const playlistId = list && SweetspotLink.isWatchPlaylistContext(list) ? list : undefined;
		return playlistId ? { type: "watch", videoId, playlistId } : { type: "watch", videoId };
	}

	/**
	 * `ssytm://music.youtube.com/…` and `ssytm://youtube.com/…` mirrors:
	 * watch, playlist?list=, channel/UC…, @handle, shorts/<id>
	 */
	private static parsePathHostUrl(parsed: URL): SweetspotParsed | null {
		const segments = parsed.pathname
			.split("/")
			.map((s) => SweetspotLink.decodeSegment(s.trim()))
			.filter(Boolean);
		const head = segments[0]?.toLowerCase();

		if (head === "watch") {
			const fromQuery = parsed.searchParams.get("v")?.trim();
			const fromPath = segments[1]?.trim();
			const videoId = fromQuery || fromPath;
			if (!videoId || !SweetspotLink.videoIdRe.test(videoId)) return null;
			const list = parsed.searchParams.get("list")?.trim();
			const playlistId = list && SweetspotLink.isWatchPlaylistContext(list) ? list : undefined;
			return playlistId ? { type: "watch", videoId, playlistId } : { type: "watch", videoId };
		}

		// youtube.com/shorts/VIDEO_ID
		if (head === "shorts") {
			const videoId = segments[1]?.trim();
			if (!videoId || !SweetspotLink.videoIdRe.test(videoId)) return null;
			return { type: "watch", videoId };
		}

		// youtube.com/embed/VIDEO_ID
		if (head === "embed") {
			const videoId = segments[1]?.trim();
			if (!videoId || !SweetspotLink.videoIdRe.test(videoId)) return null;
			return { type: "watch", videoId };
		}

		if (head === "playlist") {
			const list = parsed.searchParams.get("list")?.trim() || segments[1]?.trim();
			if (!list || !SweetspotLink.playlistIdRe.test(list)) return null;
			const play =
				segments[1]?.toLowerCase() === "play" ||
				segments[2]?.toLowerCase() === "play" ||
				parsed.searchParams.get("play") === "1";
			return { type: "playlist", playlistId: list, play };
		}

		if (head === "channel") {
			const id = segments[1]?.trim();
			if (!id || !SweetspotLink.channelIdRe.test(id)) return null;
			return { type: "channel", channelId: id };
		}

		// `/@Handle` or `%40Handle`
		const at = segments[0]?.startsWith("@") ? segments[0] : null;
		if (at) {
			const handle = SweetspotLink.normalizeHandle(at);
			return handle ? { type: "channel", handle } : null;
		}

		return null;
	}

	/**
	 * Playlist ids safe to attach on a watch link.
	 * Rejects radio/mix (`RD…`, `RDAMVM…`, `RDAMPL…`) — those make YTM show
	 * "Radio is starting…" and often never play the shared track.
	 */
	static isWatchPlaylistContext(playlistId: string): boolean {
		const id = playlistId.trim();
		if (!id || !SweetspotLink.playlistIdRe.test(id)) return false;
		if (/^RD/i.test(id)) return false;
		return true;
	}

	/** True for YouTube Music radio / automix list ids. */
	static isRadioPlaylistId(playlistId: string): boolean {
		return /^RD/i.test(playlistId.trim());
	}

	private static normalizeHandle(value?: string | null): string | null {
		if (!value) return null;
		const handle = value.trim().replace(/^@+/, "");
		return SweetspotLink.handleRe.test(handle) ? handle : null;
	}

	private static playlistFromMusicUrl(url?: string | null): string | null {
		if (!url) return null;
		try {
			const list = new URL(url).searchParams.get("list")?.trim();
			return list && SweetspotLink.isWatchPlaylistContext(list) ? list : null;
		} catch {
			return null;
		}
	}

	private static unquote(value: string): string {
		const t = value.trim();
		if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
			return t.slice(1, -1).trim();
		}
		return t;
	}
}
