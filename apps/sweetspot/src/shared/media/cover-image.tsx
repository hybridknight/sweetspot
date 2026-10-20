import { useEffect, useState, type CSSProperties } from "react";

/** App-owned artwork fallback: neutral, scalable and independent of skin code or network assets. */
export function CoverPlaceholder({
  className,
  style,
  alt = "",
}: {
  className?: string;
  style?: CSSProperties;
  alt?: string;
}) {
  return (
    <svg
      className={className}
      style={{ display: "block", width: "100%", height: "100%", ...style }}
      viewBox="0 0 100 100"
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      data-cover-placeholder="true"
    >
      <rect width="100" height="100" fill="#293342" />
      <path
        d="M58 30v34c0 6-5 10-11 10s-10-4-10-9 5-9 11-9c2 0 4 .4 6 1V30l17-4v9l-13 3"
        fill="#9ba7b8"
      />
    </svg>
  );
}

/** Remember failures per URL; a new track's artwork gets its own normal loading attempt. */
export function CoverImage({
  src,
  alt = "",
  className,
  style,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src)
    return (
      <CoverPlaceholder
        className={className}
        style={style}
        alt={alt ? "Album artwork unavailable" : ""}
      />
    );
  return (
    <img
      key={src}
      src={src}
      alt={alt}
      className={className}
      style={style}
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}

/** Preload covers for synchronized artwork/accent transitions. Failed images settle to the placeholder. */
export function useReadyArtwork(source: string | null | undefined) {
  const [ready, setReady] = useState<{ source: string | null; src: string | null }>({
    source: null,
    src: null,
  });
  useEffect(() => {
    if (!source) {
      setReady({ source: null, src: null });
      return;
    }
    let cancelled = false;
    const image = new Image();
    const done = () => {
      if (!cancelled) setReady({ source, src: image.naturalWidth > 0 ? source : null });
    };
    image.onload = done;
    image.onerror = done;
    image.src = source;
    if (image.complete) done();
    return () => {
      cancelled = true;
      image.onload = null;
      image.onerror = null;
    };
  }, [source]);
  return ready;
}
