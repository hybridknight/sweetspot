import { useId } from "react";
import { skinPresentation } from "@shared/skins/presentation";
import type { SkinPackage, SkinValues } from "@shared/skins/schema";

/** Abstract sample artwork keeps the gallery independent of the current account. */
export function SpotlightPreview({ skin, values }: { skin: SkinPackage; values: SkinValues }) {
  const id = useId().replace(/:/g, "");
  const accent = skinPresentation(skin, values)["--skin-accent"];
  const targets = Object.fromEntries(skin.settings.map((s) => [s.target, values[s.key]]));
  const queue = targets.queueExpanded !== false;
  const center = queue ? 300 : 200;
  return (
    <svg
      className="skin-preview"
      viewBox="0 0 400 320"
      role="img"
      aria-label={`${skin.name} sample player preview`}
    >
      <defs>
        <linearGradient id={id} x2=".2" y2="1">
          <stop stopColor="#8c9675" />
          <stop offset="1" stopColor="#192020" />
        </linearGradient>
        <linearGradient id={`${id}-shade`} x2="0" y2="1">
          <stop stopColor="#192020" stopOpacity=".1" />
          <stop offset="1" stopColor="#192020" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M0 0h400v320H0z" />
      <ellipse cx="117" cy="96" rx="53" ry="70" fill="#333d37" />
      <path d="M8 302Q14 159 112 150Q199 141 222 320H8Z" fill="#242e2b" />
      <path fill={`url(#${id}-shade)`} d="M0 0h400v320H0z" />
      <g fill="white" fontFamily="sans-serif">
        <text x="18" y="24" fontSize="10" letterSpacing="3">
          SPOTLIGHT
        </text>
        <path d="M18 38H382" stroke="#ffffff30" />
        <text x="352" y="24" fontSize="14">
          •••
        </text>
        {queue && (
          <g>
            <text x="24" y="130" fontSize="7" fill="#bfc7c7" letterSpacing="2">
              YOUR PLAYLIST
            </text>
            <text x="24" y="156" fontSize="25" fontWeight="800">
              THE ARTIST
            </text>
            {["Midnight Drive", "Golden Hour", "After the Rain", "Home Again"].map((title, i) => (
              <g key={title} transform={`translate(24 ${182 + i * 28})`}>
                <path d="M0 2l5 3-5 3z" fill={i === 0 ? accent : "white"} />
                <rect x="14" width="20" height="20" fill={i % 2 ? "#887c75" : "#727f76"} />
                <text x="42" y="8" fontSize="9">
                  {title}
                </text>
                {targets.showArtist !== false && (
                  <text x="42" y="18" fontSize="6" fill="#bfc7c7">
                    Sample artist
                  </text>
                )}
              </g>
            ))}
            <path d="M192 180v110" stroke="#ffffff20" strokeWidth="2" />
            <path d="M192 180v32" stroke="#ffffff80" strokeWidth="2" />
          </g>
        )}
        {targets.videoExpanded !== false && (
          <g transform={`translate(${center - 43} 65)`}>
            <rect width="86" height="86" fill="#0f1617" />
            <circle cx="43" cy="35" r="20" fill="#818984" />
            <path d="M10 86q0-38 33-36 33-2 33 36" fill="#48544d" />
          </g>
        )}
        <text x={center} y="184" textAnchor="middle" fontSize="15" fontWeight="800">
          MIDNIGHT DRIVE
        </text>
        <text x={center} y="199" textAnchor="middle" fontSize="8" fill="#bfc7c7">
          Sample artist
        </text>
        <path d={`M${center - 70} 224h140`} stroke="#ffffff40" strokeWidth="2" />
        <path d={`M${center - 70} 224h45`} stroke="#ffffffb3" strokeWidth="2" />
        <circle cx={center - 25} cy="224" r="4" />
        <circle cx={center} cy="255" r="22" fill="none" stroke="#ffffff50" />
        <path d={`M${center - 3} 250v10m6-10v10`} stroke="white" strokeWidth="2" />
        <path d={`M${center - 44} 250l-7 5 7 5zM${center + 44} 250l7 5-7 5z`} />
        <path d={`M${center - 20} 295h40`} stroke="#ffffff70" />
      </g>
    </svg>
  );
}
