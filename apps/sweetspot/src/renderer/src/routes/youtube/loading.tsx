import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/youtube/loading")({
	component: YoutubeLoadingPage,
});

function YoutubeLoadingPage() {
	return (
		<div className="music-loading" role="status" aria-live="polite" aria-busy="true">
			<div className="music-loading-layout" aria-hidden="true">
				<div className="music-loading-header">
					<div className="music-loading-brand music-loading-block" />
					<div className="music-loading-search music-loading-block" />
				</div>
				<div className="music-loading-body">
					<aside className="music-loading-sidebar">
						{Array.from({ length: 6 }, (_, index) => (
							<div className="music-loading-block" key={index} />
						))}
					</aside>
					<main className="music-loading-content">
						<div className="music-loading-heading music-loading-block" />
						<div className="music-loading-cards">
							{Array.from({ length: 4 }, (_, index) => (
								<div key={index}>
									<div className="music-loading-art music-loading-block" />
									<div className="music-loading-title music-loading-block" />
									<div className="music-loading-detail music-loading-block" />
								</div>
							))}
						</div>
						<div className="music-loading-heading music-loading-block" />
						<div className="music-loading-rows">
							{Array.from({ length: 4 }, (_, index) => (
								<div className="music-loading-row" key={index}>
									<div className="music-loading-thumb music-loading-block" />
									<div className="music-loading-title music-loading-block" />
								</div>
							))}
						</div>
					</main>
				</div>
				<div className="music-loading-player">
					<div className="music-loading-thumb music-loading-block" />
					<div className="music-loading-title music-loading-block" />
					<div className="music-loading-controls music-loading-block" />
				</div>
			</div>
			<p className="music-loading-status">Preparing your music…</p>
			<style>{`
.music-loading { position:fixed; inset:0; overflow:hidden; background:var(--music-loading-bg,#09090b); color:var(--music-loading-text,#fafafa); }
.music-loading-layout { height:100%; display:flex; flex-direction:column; }
.music-loading-block { background:var(--music-loading-block,#27272d); border-radius:10px; animation:music-loading-pulse 1.8s ease-in-out infinite; }
.music-loading-header { height:96px; flex-shrink:0; display:flex; align-items:center; gap:8%; padding:24px 32px; background:var(--music-loading-surface,#161619); }
.music-loading-brand { width:120px; height:28px; }
.music-loading-search { width:45%; max-width:540px; height:40px; border-radius:24px; }
.music-loading-body { display:flex; flex:1; min-height:0; }
.music-loading-sidebar { width:200px; flex-shrink:0; padding:32px 24px; background:var(--music-loading-surface,#161619); }
.music-loading-sidebar > div { height:24px; margin-bottom:28px; }
.music-loading-sidebar > div:nth-child(n+4) { width:75%; height:16px; }
.music-loading-content { flex:1; min-width:0; padding:40px clamp(24px,5vw,72px); overflow:hidden; }
.music-loading-heading { width:35%; min-width:160px; height:30px; margin-bottom:24px; }
.music-loading-cards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:24px; margin-bottom:48px; }
.music-loading-art { aspect-ratio:1; }
.music-loading-title { height:18px; width:85%; margin-top:16px; }
.music-loading-detail { height:14px; width:60%; margin-top:12px; }
.music-loading-rows { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:24px; }
.music-loading-row { display:flex; align-items:center; gap:16px; }
.music-loading-thumb { width:48px; height:48px; flex-shrink:0; }
.music-loading-row .music-loading-title { margin:0; width:60%; }
.music-loading-player { height:80px; flex-shrink:0; display:flex; align-items:center; gap:20px; padding:16px 32px; background:var(--music-loading-surface,#161619); }
.music-loading-player .music-loading-title { width:22%; margin:0; }
.music-loading-controls { width:120px; height:28px; margin-left:auto; }
.music-loading-status { position:absolute; left:50%; bottom:100px; transform:translateX(-50%); margin:0; padding:10px 18px; border-radius:24px; background:var(--music-loading-surface,#161619); color:var(--music-loading-muted,#b5b5c0); font-size:14px; white-space:nowrap; }
@keyframes music-loading-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
@media(max-width:900px) { .music-loading-sidebar { width:80px; padding:32px 20px; } .music-loading-cards { grid-template-columns:repeat(3,minmax(0,1fr)); } .music-loading-cards > :last-child { display:none; } }
@media(prefers-reduced-motion:reduce) { .music-loading-block { animation:none; } }
`}</style>
		</div>
	);
}
