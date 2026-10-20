import { useRef } from "react";
export function PanelResizer({
  name,
  label,
  minimum,
  height,
  onResize,
}: {
  name: string;
  label: string;
  minimum: () => number;
  height?: number;
  onResize: (height: number) => void;
}) {
  const start = useRef<{ y: number; height: number } | null>(null);
  const currentHeight = (element: HTMLElement) =>
    element.closest(".module-slot")!.getBoundingClientRect().height;
  return (
    <div
      className={`panel-resizer ${name === "media" ? "media-resizer" : ""}`}
      role="separator"
      aria-label={`Resize ${label} panel`}
      aria-orientation="horizontal"
      tabIndex={0}
      aria-valuemin={Math.ceil(minimum())}
      aria-valuemax={1800}
      aria-valuenow={height === undefined ? undefined : Math.round(height)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        start.current = { y: event.clientY, height: currentHeight(event.currentTarget) };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (start.current)
          onResize(Math.max(minimum(), start.current.height + event.clientY - start.current.y));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
      onLostPointerCapture={() => {
        start.current = null;
      }}
      onKeyDown={(event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        onResize(
          event.key === "Home"
            ? minimum()
            : event.key === "End"
              ? Math.max(minimum(), 600)
              : Math.max(
                  minimum(),
                  currentHeight(event.currentTarget) + (event.key === "ArrowDown" ? 20 : -20),
                ),
        );
      }}
    >
      <svg viewBox="0 0 40 4" aria-hidden="true">
        <path d="M12 2H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
