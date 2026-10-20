import { useEffect, useId, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { SPECTRUM_BANDS } from "@shared/skins/spectrum";
import { animateSpectrum } from "./spectrum-animation";
/** App-owned SVG only: skin files choose colors/settings, never run visualization code. */
export function Spectrum({ playing, wave = false }: { playing: boolean; wave?: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const target = useRef<number[]>(Array(SPECTRUM_BANDS).fill(0));
  const wake = useRef<() => void>(() => {});
  const patternId = useId();
  const [available, setAvailable] = useState(false);
  const [visible, setVisible] = useState(!document.hidden);
  useEffect(() => {
    let intersecting = true;
    const update = () => setVisible(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    if (svg.current) observer.observe(svg.current);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  trpc.player.spectrum.useSubscription(undefined, {
    // Unsubscribing also disconnects the audio analysis branch in the source player.
    enabled: visible && playing,
    onData: (frame) => {
      setAvailable(frame.available);
      for (let i = 0; i < SPECTRUM_BANDS; i++)
        target.current[i] = frame.available ? (frame.bands[i] ?? 0) : 0;
      wake.current();
    },
    onError: () => {
      setAvailable(false);
      target.current.fill(0);
      wake.current();
    },
  });
  useEffect(() => {
    if (!visible) return;
    if (!playing) target.current.fill(0);
    const bars = svg.current?.querySelector<SVGPathElement>(".spectrum-bar");
    const tips = svg.current?.querySelector<SVGPathElement>(".spectrum-peak");
    const animation = animateSpectrum({
      wave,
      playing,
      target: () => target.current,
      paint: (paths) => {
        if (bars?.getAttribute("d") !== paths.bars) bars?.setAttribute("d", paths.bars);
        if (tips?.getAttribute("d") !== paths.tips) tips?.setAttribute("d", paths.tips);
      },
    });
    wake.current = animation.wake;
    return () => {
      wake.current = () => {};
      animation.dispose();
    };
  }, [wave, playing, visible]);
  return (
    <svg
      ref={svg}
      className={`live-spectrum ${wave ? "spectrum-wave" : ""}`}
      viewBox={wave ? "0 0 480 48" : "0 0 160 48"}
      preserveAspectRatio={wave ? "none" : "xMidYMid meet"}
      role="img"
      aria-label={available ? "Live audio spectrum" : "Waiting for local audio spectrum"}
      data-available={available}
    >
      <defs>
        <pattern id={patternId} width="5" height={wave ? 48 : 3} patternUnits="userSpaceOnUse">
          <rect width="3" height={wave ? 48 : 2} fill="currentColor" />
        </pattern>
      </defs>
      <path className="spectrum-bar" fill={`url(#${patternId})`} />
      {!wave && <path className="spectrum-peak" fill="currentColor" opacity=".65" />}
      <path d={wave ? "M0 46H480" : "M0 46H160"} stroke="currentColor" opacity=".18" />
    </svg>
  );
}
const digits = [
  "abcdef",
  "bc",
  "abdeg",
  "abcdg",
  "bcfg",
  "acdfg",
  "acdefg",
  "abc",
  "abcdefg",
  "abcdfg",
];
const segments = [
  "M3 1H13L11 3H5Z",
  "M13 2V10L11 9V4Z",
  "M13 12V20L11 18V13Z",
  "M3 21H13L11 19H5Z",
  "M1 12V20L3 18V13Z",
  "M1 2V10L3 9V4Z",
  "M3 11L5 10H11L13 11L11 12H5Z",
];
export function DigitalClock({ value }: { value: string }) {
  return (
    <svg
      className="retro-clock"
      viewBox={`0 0 ${value.length * 16} 23`}
      role="img"
      aria-label={value}
    >
      {[...value].map((char, index) => (
        <g key={index} transform={`translate(${index * 16} 0)`}>
          {char === ":" ? (
            <>
              <circle cx="7" cy="7" r="1.4" />
              <circle cx="7" cy="16" r="1.4" />
            </>
          ) : (
            segments.map((path, segment) => (
              <path
                key={segment}
                d={path}
                opacity={digits[Number(char)]?.includes("abcdefg"[segment]) ? 1 : 0.08}
              />
            ))
          )}
        </g>
      ))}
    </svg>
  );
}
