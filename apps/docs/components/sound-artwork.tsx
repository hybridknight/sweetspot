const bands = [34, 26, 18, 30, 44, 51, 39, 24, 16, 29];
const waveform = [8, 16, 27, 19, 38, 48, 31, 23, 41, 28, 16, 35, 46, 25, 13, 29, 39, 21];

export function SoundArtwork() {
  return (
    <svg className="ss-sound-illustration" viewBox="0 0 640 400" role="img" aria-labelledby="sound-art-title sound-art-description">
      <title id="sound-art-title">Shape. Blend. Balance.</title>
      <desc id="sound-art-description">An editorial sound illustration with interwoven crossfade ribbons, ten equalizer controls, and a waveform held within a consistent volume range.</desc>
      <rect width="640" height="400" fill="#292426" />
      <path d="M0 240H640M380 240V400" stroke="#4c3d40" />
      <g fill="#c9b4b3" fontFamily="Inter, sans-serif" fontSize="10" letterSpacing="2">
        <text x="28" y="32">02 / BLEND</text>
        <text x="28" y="270">01 / SHAPE</text>
        <text x="404" y="270">03 / BALANCE</text>
      </g>
      <g fill="none" stroke="#5a4148">
        <circle cx="552" cy="112" r="83" />
        <circle cx="552" cy="112" r="65" />
        <circle cx="552" cy="112" r="47" />
        <circle cx="552" cy="112" r="29" />
        <circle cx="552" cy="112" r="11" />
        <path d="M28 205H612" strokeDasharray="2 6" />
      </g>
      <path d="M-16 133C80 74 150 107 239 148S396 211 474 170S575 98 658 128L658 178C568 146 545 196 474 210S308 218 219 184S78 117-16 190Z" fill="#e6d3bd" />
      <path d="M-16 195C75 223 157 192 239 150S386 83 470 115S573 197 658 160L658 203C555 230 520 157 450 148S311 160 239 190S84 253-16 221Z" fill="#b52c39" />
      <path d="M-16 162C80 103 150 132 239 166S396 215 474 190S575 122 658 152" fill="none" stroke="#fff4e5" strokeWidth="1.5" />
      <path d="M-16 208C75 236 157 207 239 170S386 107 470 131S573 213 658 181" fill="none" stroke="#ed7c88" strokeWidth="1.5" />
      <circle cx="320" cy="162" r="5" fill="#f5eee6" />
      <circle cx="320" cy="162" r="12" fill="none" stroke="#f5eee6" strokeOpacity=".5" />
      <g transform="translate(28 294)">
        {[0, 25, 50, 75].map((y) => <path key={y} d={`M0 ${y}H324`} stroke="#463b3f" strokeDasharray="2 5" />)}
        {bands.map((height, index) => (
          <g key={index} transform={`translate(${12 + index * 33} 0)`}>
            <path d="M0 0V75" stroke="#62494e" strokeWidth="2" />
            <path d={`M0 ${height}V75`} stroke={index > 5 ? "#bd5d6b" : "#e6d3bd"} strokeWidth="2" />
            <rect x="-7" y={height - 4} width="14" height="8" rx="2" fill={index > 5 ? "#bd5d6b" : "#f5eee6"} />
          </g>
        ))}
        <path d="M12 34C43 26 65 14 78 18S116 41 144 44S168 58 177 51S229 18 243 24S272 9 276 16S306 26 309 29" fill="none" stroke="#c9a4a9" strokeWidth="1.5" />
      </g>
      <g transform="translate(405 304)">
        <rect x="-5" y="4" width="211" height="62" rx="8" fill="#392c31" />
        <path d="M-5 4H206M-5 66H206" stroke="#a0606a" strokeDasharray="3 4" />
        {waveform.map((height, index) => <rect key={index} x={index * 11} y={35 - height / 2} width="5" height={height} rx="2.5" fill={index < 9 ? "#e6d3bd" : "#c77987"} />)}
        <circle cx="207" cy="4" r="3" fill="#c77987" />
      </g>
      <g fill="#927b80" fontFamily="Inter, sans-serif" fontSize="8" letterSpacing="1">
        <text x="28" y="388">LOW</text><text x="328" y="388">HIGH</text>
        <text x="405" y="388">EVERY TRACK. SAME COMFORT.</text>
      </g>
    </svg>
  );
}
