import type { ReleaseNoteEntry } from "@shared/utils/updater";
import { type ComponentProps, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type MDXContent, markdownParser } from "@/lib/markdown-parser";
import { cn } from "@/lib/utils";

interface MarkdownBodyProps {
	markdown: string;
	className?: string;
}

const mdxComponents = {
	a: (props: ComponentProps<"a">) => (
		<a {...props} className={cn("text-primary underline-offset-2 hover:underline", props.className)} target="_blank" rel="noreferrer" />
	),
	img: () => null,
	ul: (props: ComponentProps<"ul">) => <ul {...props} className={cn("my-1 flex flex-col gap-1.5 pl-4 list-disc", props.className)} />,
	ol: (props: ComponentProps<"ol">) => <ol {...props} className={cn("my-1 flex flex-col gap-1.5 pl-4 list-decimal", props.className)} />,
	li: (props: ComponentProps<"li">) => <li {...props} className={cn("text-xs/relaxed text-muted-foreground", props.className)} />,
	p: (props: ComponentProps<"p">) => <p {...props} className={cn("text-xs/relaxed text-muted-foreground", props.className)} />,
	h1: (props: ComponentProps<"h1">) => <h3 {...props} className={cn("text-xs font-medium text-foreground", props.className)} />,
	h2: (props: ComponentProps<"h2">) => <h3 {...props} className={cn("text-xs font-medium text-foreground", props.className)} />,
	h3: (props: ComponentProps<"h3">) => <h4 {...props} className={cn("text-xs font-medium text-foreground", props.className)} />,
	code: (props: ComponentProps<"code">) => (
		<code {...props} className={cn("rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]", props.className)} />
	),
	hr: (props: ComponentProps<"hr">) => <hr {...props} className={cn("border-border", props.className)} />,
};

function MarkdownBody({ markdown, className }: MarkdownBodyProps) {
	const [Content, setContent] = useState<MDXContent | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		setContent(null);
		setFailed(false);

		void markdownParser
			.parseReleaseNotes(markdown)
			.then((next) => {
				if (!cancelled) setContent(() => next);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});

		return () => {
			cancelled = true;
		};
	}, [markdown]);

	if (failed) {
		return <pre className={cn("whitespace-pre-wrap text-xs/relaxed text-muted-foreground", className)}>{markdown}</pre>;
	}

	if (!Content) {
		return (
			<div className={cn("flex flex-col gap-2", className)}>
				<Skeleton className="h-3 w-3/4" />
				<Skeleton className="h-3 w-full" />
			</div>
		);
	}

	return (
		<div className={cn("flex flex-col gap-1", className)}>
			<Content components={mdxComponents} />
		</div>
	);
}

interface ReleaseHighlightsProps {
	releases: ReleaseNoteEntry[];
	className?: string;
}

export function ReleaseHighlights({ releases, className }: ReleaseHighlightsProps) {
	const release = releases[0];
	return (
		<section className={cn("flex flex-col gap-4", className)} aria-label="Release highlights">
			<div className="flex items-center gap-2">
				<h2 className="text-sm font-medium">What’s new</h2>
				{release ? <Badge variant="outline">v{release.version}</Badge> : null}
			</div>
			{release?.body ? (
				<MarkdownBody markdown={release.body} />
			) : (
				<p className="text-xs text-muted-foreground">No release notes for this version.</p>
			)}
		</section>
	);
}

export function ReleaseNotes({ markdown, className }: { markdown: string; className?: string }) {
	return <MarkdownBody markdown={markdown} className={className} />;
}
