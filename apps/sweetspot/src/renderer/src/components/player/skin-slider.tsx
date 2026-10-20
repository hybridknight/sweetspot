import type { InputHTMLAttributes } from "react";
/** Fixed-pixel artwork behind a native range input preserves accessible controls. */
export function SkinSlider({
  metal = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { metal?: boolean }) {
  const min = Number(props.min ?? 0),
    max = Number(props.max ?? 100),
    value = Number(props.value ?? min);
  const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  return (
    <span className="skin-horizontal" data-metal={metal}>
      <span className="skin-slider-rail" aria-hidden="true">
        <span className="skin-slider-fill" style={{ width: `${pct * 100}%` }} />
        <span className="skin-slider-thumb" style={{ left: `${pct * 100}%` }} />
      </span>
      <input {...props} type="range" />
    </span>
  );
}
