import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"

/**
 * RouteCard — one comparable option in a list the user chooses between.
 *
 * Built for quotes and routes, but it carries no routing logic: the card is a
 * selectable surface with a headline figure, a tag strip and a metadata row.
 * The selected state is explicit (border, tinted surface and an indicator) so
 * selection never relies on colour alone.
 */

/**
 * Props that make a disabled option genuinely inert.
 *
 * `pointer-events: none` and `aria-disabled` alone leave an `asChild` button
 * focusable and keyboard-activatable, so an unavailable option could still be
 * chosen with Enter or Space. Native `disabled` is forwarded to the rendered
 * child, and the capture-phase handlers stop activation for any child element
 * that does not honour it (an anchor, a div, a label).
 */
function disabledInteractionProps(disabled: boolean) {
  if (!disabled) return {}
  const block = (event: React.SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  return {
    tabIndex: -1,
    "aria-disabled": true as const,
    onClickCapture: block,
    onKeyDownCapture: (event: React.KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        block(event)
      }
    },
  }
}

export interface RouteCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as the child element (e.g. a `button` or `label` for selection). */
  asChild?: boolean
  selected?: boolean
  disabled?: boolean
}

const RouteCard = React.forwardRef<HTMLDivElement, RouteCardProps>(
  (
    { className, asChild = false, selected = false, disabled = false, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "div"
    return (
      <Comp
        ref={ref}
        data-selected={selected || undefined}
        data-disabled={disabled || undefined}
        {...disabledInteractionProps(disabled)}
        {...(asChild && disabled ? { disabled: true } : {})}
        className={cn(
          "relative flex w-full flex-col gap-2 rounded-lg border bg-card p-3 text-left text-card-foreground transition-colors",
          "hover-elevate active-elevate-2",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          selected && "border-primary bg-accent/50",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
RouteCard.displayName = "RouteCard"

const RouteCardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-wrap items-center gap-2", className)}
    {...props}
  />
))
RouteCardHeader.displayName = "RouteCardHeader"

const RouteCardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm font-semibold leading-none", className)}
    {...props}
  />
))
RouteCardTitle.displayName = "RouteCardTitle"

/** The headline figure the options are compared on. */
const RouteCardAmount = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "font-mono text-xl font-semibold leading-tight tabular-nums",
      className
    )}
    {...props}
  />
))
RouteCardAmount.displayName = "RouteCardAmount"

const RouteCardSubtext = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
))
RouteCardSubtext.displayName = "RouteCardSubtext"

const RouteCardMeta = React.forwardRef<
  HTMLDListElement,
  React.HTMLAttributes<HTMLDListElement>
>(({ className, ...props }, ref) => (
  <dl
    ref={ref}
    className={cn(
      "flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
      className
    )}
    {...props}
  />
))
RouteCardMeta.displayName = "RouteCardMeta"

export interface RouteCardMetaItemProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode
}

const RouteCardMetaItem = React.forwardRef<
  HTMLDivElement,
  RouteCardMetaItemProps
>(({ className, label, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-1.5", className)}
    {...props}
  >
    <dt>{label}</dt>
    <dd className="font-mono font-medium tabular-nums text-foreground">
      {children}
    </dd>
  </div>
))
RouteCardMetaItem.displayName = "RouteCardMetaItem"

/** Corner indicator for the chosen option. Pair it with a check icon. */
const RouteCardIndicator = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "ml-auto flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground [&_svg]:size-3",
      className
    )}
    {...props}
  />
))
RouteCardIndicator.displayName = "RouteCardIndicator"

export {
  RouteCard,
  RouteCardHeader,
  RouteCardTitle,
  RouteCardAmount,
  RouteCardSubtext,
  RouteCardMeta,
  RouteCardMetaItem,
  RouteCardIndicator,
}
