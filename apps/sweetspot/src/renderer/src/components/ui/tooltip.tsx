import { cloneElement, createContext, useContext, useId, type ReactElement, type ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

const CompactTooltipContext = createContext(false)

function TooltipProvider({
  delay = 0,
  compact = false,
  ...props
}: TooltipPrimitive.Provider.Props & { compact?: boolean }) {
  return (
    <CompactTooltipContext.Provider value={compact}>
      <TooltipPrimitive.Provider
        data-slot="tooltip-provider"
        delay={delay}
        {...props}
      />
    </CompactTooltipContext.Provider>
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side,
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const compact = useContext(CompactTooltipContext)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side ?? (compact ? "left" : "top")}
        sideOffset={sideOffset}
        className="pointer-events-none isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            "pointer-events-none z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-sm leading-snug text-popover-foreground shadow-lg has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-lg data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            compact && "max-h-[calc(100vh-8px)] max-w-[calc(100vw-8px)] overflow-hidden px-2 py-1 text-xs leading-4 shadow-sm data-open:animate-none data-closed:animate-none",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-lg bg-popover fill-popover data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function HoverTooltip({ children, content, delay = 0, side }: {
  children: ReactElement<{ "aria-describedby"?: string }>;
  content?: ReactNode;
  delay?: number;
  side?: TooltipPrimitive.Positioner.Props["side"];
}) {
  const id = useId()
  if (!content) return children
  const trigger = cloneElement(children, {
    "aria-describedby": [children.props["aria-describedby"], id].filter(Boolean).join(" "),
  })
  const tooltip = (
    <Tooltip>
      <TooltipTrigger render={trigger} delay={delay} />
      <TooltipContent id={id} side={side} sideOffset={8}>{content}</TooltipContent>
    </Tooltip>
  )
  // Delayed controls keep their delay even after hovering an instant tooltip.
  return delay > 0 ? <TooltipProvider delay={delay} timeout={0}>{tooltip}</TooltipProvider> : tooltip
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, HoverTooltip }
