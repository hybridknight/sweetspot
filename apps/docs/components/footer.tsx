import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { getBlobUrl, getRepositoryUrl } from "@/lib/github";

const listening = [
  ["Player & skins", "/docs/features/player"],
  ["Equalizer", "/docs/features/equalizer"],
  ["Synced lyrics", "/docs/features/lyrics"],
] as const;
const resources = [
  ["Get Sweet Spot", "/#download"],
  ["Documentation", "/docs"],
  ["Release notes", "/changelog"],
] as const;

export function Footer() {
  return (
    <footer className="ss-site-footer">
      <div className="ss-footer-inner">
        <div className="ss-footer-top">
          <div className="ss-footer-brand">
            <Link href="/" aria-label="Sweet Spot home" className="ss-footer-logo">
              <Logo size={30} />
            </Link>
            <p>Make room for music.</p>
            <span>A little more room for the way you listen.</span>
            <span className="ss-footer-platforms">Windows · macOS</span>
          </div>
          <nav aria-label="Listening guides">
            <h2>Make it yours</h2>
            {listening.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Resources">
            <h2>Find your way</h2>
            {resources.map(([label, href]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Project">
            <h2>Out in the open</h2>
            <a href={getRepositoryUrl()} target="_blank" rel="noreferrer">
              GitHub <ArrowUpRight size={13} />
            </a>
            <Link href="/docs/build">Build from source</Link>
            <a href={getBlobUrl("LICENSE")} target="_blank" rel="noreferrer">
              License <ArrowUpRight size={13} />
            </a>
          </nav>
        </div>
        <div className="ss-footer-bottom">
          <span>© {new Date().getFullYear()} Sweet Spot contributors · CC0</span>
          <span>Independent of Google and YouTube.</span>
          <a href="#" className="ss-footer-back">
            Back to top <span aria-hidden>↑</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
