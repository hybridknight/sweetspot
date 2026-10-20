import { describe, expect, it } from "vitest";
import { MarkdownStringParser } from "./markdown-parser";

const parser = new MarkdownStringParser();

describe("release notes", () => {
	it("keeps user benefits without adding author avatars", () => {
		const notes = "- Fewer password prompts.\n- Easier downloads.";
		expect(parser.preprocessReleaseNotes(notes)).toBe(notes);
	});

	it("preserves semicolons and mentions in ordinary prose", () => {
		const notes = "- Update faster; keep your settings; thanks @contributor.";
		expect(parser.preprocessReleaseNotes(notes)).toBe(notes);
	});

	it("normalizes changelog links consistently across repeated calls", () => {
		const url = "https://github.com/hybridknight/sweetspot/compare/v1.0.1...v1.0.2";
		const notes = `**Full Changelog**: ${url}`;
		for (let i = 0; i < 2; i++) {
			expect(parser.preprocessReleaseNotes(notes)).toBe(`[View on GitHub](${url})`);
		}
	});
});
