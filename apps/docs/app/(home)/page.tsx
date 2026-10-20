import { PlayerHero } from "@/components/player-hero";
import { SoundArtwork } from "@/components/sound-artwork";
import { ReleaseDownloadPanel } from "@/components/release-download-panel";
import { getLatestReleasesByChannel } from "@/lib/github";
import { assetPath } from "@/lib/paths";
import {
  Bot,
  ArrowUpRight,
  SlidersHorizontal,
  Palette,
  AudioLines,
  Captions,
  Keyboard,
  CirclePlay,
  Video,
  Play,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const features = [
  {
    title: "A player that feels like yours",
    text: "Seven skins. Your colors, your panels, your space. Keep your playlist, video, and sound controls close.",
    href: "/docs/features/player",
    icon: Palette,
    image: "skins",
  },
  {
    title: "Your music, in the conversation",
    text: "Connect your AI assistant with MCP to check what’s playing and control playback. Build your own tools and automations with the local HTTP and WebSocket API.",
    href: "/docs/integrations",
    icon: Bot,
    image: null,
  },
] as const;

export default async function HomePage() {
  const releases = await getLatestReleasesByChannel();
  return (
    <main className="ss-home">
      <section className="ss-hero">
        <div className="ss-hero-copy">
          <h1>
            Make room
            <br />
            for music.
          </h1>
          <p className="ss-intro">
            Your desktop home for YouTube Music.
          </p>
          <div className="ss-actions">
            <a className="ss-button ss-button-primary" href="#download">
              Get Sweet Spot <ArrowUpRight size={17} />
            </a>
            <Link className="ss-hero-docs-link" href="/docs">
              Read the docs <ArrowUpRight size={15} />
            </Link>
          </div>
          <p className="ss-caption">For Windows and macOS · Open source</p>
        </div>
        <PlayerHero />
      </section>

      <section className="ss-section" id="features">
        <div className="ss-section-heading">
          <div>
            <p className="ss-eyebrow">MADE FOR EVERYDAY LISTENING</p>
            <h2>
              A few good reasons
              <br />
              to stay a little longer.
            </h2>
          </div>
          <Link href="/docs/features">
            All features <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="ss-feature-grid">
          {features.map(({ title, text, href, icon: Icon, image }, i) => (
            <Link href={href} className="ss-feature" key={href}>
              <div className={`ss-feature-image${image === "skins" ? " ss-feature-image-skins" : ""}`}>
                {image === "skins" ? <div className="ss-skins-showcase" aria-label="Spotlight, Studio, Pop, and Sleeve player skins">
                  {[
                    { id: "spotlight", song: "There's Nothing Holdin' Me Back", artist: "Shawn Mendes" },
                    { id: "studio", song: "Me & You", artist: "HONNE" },
                    { id: "pop", song: "Super Shy", artist: "NewJeans" },
                    { id: "sleeve", song: "ILYSB (STRIPPED)", artist: "LANY" },
                  ].map((skin) => <figure className={`ss-skin-showcase-item ss-skin-showcase-${skin.id}`} key={skin.id}>
                    <div className="ss-skin-showcase-window">
                      <Image src={assetPath(`/screenshots/skins/player-${skin.id}.png`)} alt={`${skin.id} skin: ${skin.song} by ${skin.artist}`} fill sizes="(max-width: 580px) 50vw, 280px" />
                    </div>
                  </figure>)}
                </div> : image ? <Image
                  src={assetPath(`/screenshots/${image}-preview.png`)}
                  alt={`${title} in Sweet Spot`}
                  width={1440}
                  height={1000}
                  className="ss-screenshot"
                /> : <div className="ss-mcp-preview" aria-label="Example AI assistant conversation with Sweet Spot">
                  <div className="ss-mcp-preview-header"><Bot size={18} /><span>AI assistant + Sweet Spot</span><span className="ss-mcp-preview-badge">MCP</span></div>
                  <div className="ss-mcp-message ss-mcp-question">Suggest something warm and upbeat, and play it.</div>
                  <div className="ss-mcp-message ss-mcp-answer"><AudioLines size={18} /><span>Let’s give your evening a little lift. “Birds of a Feather” by Billie Eilish is warm and breezy. Playing it in Sweet Spot for you.</span></div>
                  <div className="ss-mcp-preview-tools"><span>Mood suggestion</span><span>Play in Sweet Spot</span></div>
                </div>}
              </div>
              <div className="ss-feature-copy">
                <span className="ss-feature-index">
                  0{i + 1} / <Icon size={16} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="ss-read">
                  Take a look <ArrowUpRight size={16} />
                </span>
              </div>
            </Link>
          ))}
          <article className="ss-feature ss-feature-sound">
            <div className="ss-feature-image ss-sound-artwork">
              <SoundArtwork />
            </div>
            <div className="ss-feature-copy">
              <span className="ss-feature-index">03 / <SlidersHorizontal size={16} /><AudioLines size={16} /></span>
              <h3>Find your sound. Settle into listening.</h3>
              <p>Shape your sound with a ten-band equalizer, built-in presets, and automatic headroom. Keep listening with consistent volume, softer starts and stops, and optional song fades.</p>
              <div className="ss-sound-links">
                <Link className="ss-read" href="/docs/features/equalizer">Explore the equalizer <ArrowUpRight size={16} /></Link>
                <Link className="ss-read" href="/docs/features/playback">Explore playback <ArrowUpRight size={16} /></Link>
              </div>
            </div>
          </article>
          <Link href="/docs/features/playback#watch-music-videos" className="ss-feature ss-feature-video">
            <div className="ss-feature-image ss-video-preview" aria-label="Music video playback illustration">
              <Image src={assetPath("/images/video-playback.jpg")} alt="Billie Eilish in the BIRDS OF A FEATHER music video" fill sizes="(max-width: 760px) 100vw, 560px" />
              <div className="ss-video-modes" aria-hidden="true"><span>Artwork</span><span className="ss-video-mode-active"><Video size={12} /> Video</span></div>
              <span className="ss-video-play" aria-hidden="true"><Play size={26} fill="currentColor" /></span>
              <div className="ss-video-caption"><span>BIRDS OF A FEATHER</span><span>Billie Eilish</span></div>
            </div>
            <div className="ss-feature-copy">
              <span className="ss-feature-index">04 / <Video size={16} /></span>
              <h3>See the music, too.</h3>
              <p>Switch between artwork and music videos without leaving your player. Watch supported tracks in your favorite skin and choose your preferred video quality.</p>
              <span className="ss-read">Explore video playback <ArrowUpRight size={16} /></span>
            </div>
          </Link>
        </div>
      </section>

      <section className="ss-tools">
        <div>
          <p className="ss-eyebrow">BEYOND THE MAIN WINDOW</p>
          <h2>
            Small controls.
            <br />
            Useful connections.
          </h2>
        </div>
        <div className="ss-tool-list">
          <Link href="/docs/features/tray-view">
            <CirclePlay />
            <div>
              <h3>Always within reach</h3>
              <p>Tray controls and a pinnable player for the moments between tasks.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <Link href="/docs/features/playback">
            <Keyboard />
            <div>
              <h3>Keep your hands where they are</h3>
              <p>Media keys and optional global playback shortcuts.</p>
            </div>
            <ArrowUpRight />
          </Link>
          <Link href="/docs/features/lyrics">
            <Captions />
            <div>
              <h3>Follow every line</h3>
              <p>Timed lyrics, multiple providers, and highlighting that follows the music.</p>
            </div>
            <ArrowUpRight />
          </Link>
        </div>
      </section>

      <section id="download" className="ss-download">
        <div>
          <p className="ss-eyebrow">READY WHEN YOU ARE</p>
          <h2>
            Make yourself
            <br />
            at home.
          </h2>
          <p>
            Choose a build for your computer, sign in to YouTube Music, and find your sweet spot.
          </p>
          <Link href="/docs/install">
            Installation guide <ArrowUpRight size={16} />
          </Link>
        </div>
        <ReleaseDownloadPanel releases={releases} />
      </section>
    </main>
  );
}
