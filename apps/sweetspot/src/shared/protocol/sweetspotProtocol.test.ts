import { describe, expect, test } from "vitest";
import { SweetspotLink } from "./sweetspotProtocol";

describe("SweetspotLink.fromHttps", () => {
	test("converts music / youtube / youtu.be hosts", () => {
		expect(SweetspotLink.fromHttps("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
			"ssytm://music.youtube.com/watch?v=dQw4w9WgXcQ",
		);
		expect(SweetspotLink.fromHttps("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
			"ssytm://www.youtube.com/watch?v=dQw4w9WgXcQ",
		);
		expect(SweetspotLink.fromHttps("https://youtu.be/dQw4w9WgXcQ")).toBe("ssytm://youtu.be/dQw4w9WgXcQ");
		expect(SweetspotLink.fromHttps("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
	});
});

describe("SweetspotLink.resolve", () => {
	test("watch hosts", () => {
		expect(SweetspotLink.resolve("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
		});
		expect(SweetspotLink.resolve("ssytm://youtu.be/dQw4w9WgXcQ")).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
		});
		expect(SweetspotLink.resolve("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
		});
	});

	test("strips radio list on watch", () => {
		expect(SweetspotLink.resolve("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDAMVM12345678901")).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
		});
		expect(SweetspotLink.resolve("ssytm://watch/dQw4w9WgXcQ/RDAMVM12345678901")).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
		});
	});

	test("keeps album list on watch", () => {
		expect(
			SweetspotLink.resolve("https://youtu.be/dQw4w9WgXcQ?list=OLAK5uy_abcdefghijklmnopqrs"),
		).toEqual({
			type: "watch",
			videoId: "dQw4w9WgXcQ",
			playlistId: "OLAK5uy_abcdefghijklmnopqrs",
		});
	});

	test("playlist and channel", () => {
		expect(SweetspotLink.resolve("ssytm://playlist/PLabcdefghijklmnopqrstuv/play")).toEqual({
			type: "playlist",
			playlistId: "PLabcdefghijklmnopqrstuv",
			play: true,
		});
		expect(SweetspotLink.resolve("ssytm://www.youtube.com/channel/UCabcdefghijklmnopqrstuv")).toEqual({
			type: "channel",
			channelId: "UCabcdefghijklmnopqrstuv",
		});
		expect(SweetspotLink.resolve("ssytm://music.youtube.com/%40Some_Handle")).toEqual({
			type: "channel",
			handle: "Some_Handle",
		});
	});

	test("toSweetspot compact rewrite", () => {
		expect(SweetspotLink.toSweetspot("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("ssytm://watch/dQw4w9WgXcQ");
		expect(SweetspotLink.toSweetspot("https://youtu.be/dQw4w9WgXcQ")).toBe("ssytm://watch/dQw4w9WgXcQ");
		expect(SweetspotLink.toSweetspot("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
		// YTM share panel URL includes tracking `si=`
		expect(SweetspotLink.toSweetspot("https://music.youtube.com/watch?v=i5WFoQjPAss&si=bCGoYN4b-_wCsQeQ")).toBe(
			"ssytm://watch/i5WFoQjPAss",
		);
	});

	test("rejects junk", () => {
		expect(SweetspotLink.resolve("ssytm://watch/short")).toBeNull();
		expect(SweetspotLink.resolve("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
		expect(SweetspotLink.resolve("not-a-url")).toBeNull();
	});
});
