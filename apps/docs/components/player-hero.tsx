"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CirclePlay } from "lucide-react";
import { assetPath } from "@/lib/paths";

const players = [
  { id: "spotlight", name: "Spotlight", alt: "Sweet Spot Spotlight player playing There's Nothing Holdin' Me Back by Shawn Mendes" },
  { id: "studio", name: "Studio", alt: "Sweet Spot Studio player playing Me & You by HONNE" },
  { id: "pop", name: "Pop", alt: "Sweet Spot Pop player playing Super Shy by NewJeans, with video and playlist" },
];

export function PlayerHero() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (paused) return;
    const timer = window.setInterval(() => {
      if (!motion.matches && !document.hidden) setActive((index) => (index + 1) % players.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div className="ss-hero-visual" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div className="ss-player-hero-slides">
        {players.map((player, index) => (
          <div className={`ss-player-hero-slide ss-player-hero-${player.id}`} data-active={active === index} aria-hidden={active !== index} key={player.id}>
            <div className="ss-player-hero-window">
              <Image src={assetPath(`/screenshots/skins/player-${player.id}.png`)} alt={player.alt} fill priority={index === 0} sizes="(max-width: 760px) 100vw, 60vw" />
            </div>
          </div>
        ))}
      </div>
      <div className="ss-visual-footer">
        <CirclePlay size={18} />
        <span>A different look. The same music library.</span>
        <div className="ss-player-hero-controls" aria-label="Player screenshots">
          {players.map((player, index) => <button key={player.id} type="button" aria-label={`Show ${player.name}`} aria-pressed={active === index} onClick={() => setActive(index)}>{String(index + 1).padStart(2, "0")}</button>)}
        </div>
      </div>
    </div>
  );
}
