import * as React from "react"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"

/**
 * AssetRow — one selectable asset, carrying its own network identity.
 *
 * An asset symbol alone is ambiguous when the same symbol exists on several
 * networks, so the avatar always has room for a network sigil and the label
 * always has room for a network name. Pass real marks in; the fallbacks here
 * are initials, never an invented logo.
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

export interface AssetRowProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Render as the child element (e.g. a `button` for a select trigger). */
  asChild?: boolean
  selected?: boolean
  disabled?: boolean
}

const AssetRow = React.forwardRef<HTMLDivElement, AssetRowProps>(
  ({ className, asChild = false, selected = false, disabled = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "div"
    return (
      <Comp
        ref={ref}
        data-selected={selected || undefined}
        data-disabled={disabled || undefined}
        {...disabledInteractionProps(disabled)}
        {...(asChild && disabled ? { disabled: true } : {})}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg border bg-secondary px-3 py-2 text-left text-secondary-foreground transition-colors",
          "hover-elevate active-elevate-2",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          selected && "border-primary bg-accent text-accent-foreground",
          disabled && "pointer-events-none opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
AssetRow.displayName = "AssetRow"

export interface AssetRowAvatarProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Asset artwork. Omit to fall back to `fallback` initials. */
  src?: string
  alt?: string
  /** Initials shown when no artwork is supplied. */
  fallback?: string
  /** A small sigil pinned to the lower-right corner for the network. */
  network?: React.ReactNode
}

const AssetRowAvatar = React.forwardRef<HTMLSpanElement, AssetRowAvatarProps>(
  ({ className, src, alt = "", fallback, network, ...props }, ref) => (
    <span
      ref={ref}
      className={cn("relative inline-flex size-9 shrink-0", className)}
      {...props}
    >
      <span className="flex size-9 items-center justify-center overflow-hidden rounded-full border bg-muted text-xs font-semibold text-muted-foreground">
        {src ? (
          <img src={src} alt={alt} className="size-full object-cover" />
        ) : (
          fallback
        )}
      </span>
      {network ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center overflow-hidden rounded-full border border-card bg-card text-[0.5rem] font-bold leading-none text-muted-foreground">
          {network}
        </span>
      ) : null}
    </span>
  )
)
AssetRowAvatar.displayName = "AssetRowAvatar"

export interface AssetRowTextProps
  extends React.HTMLAttributes<HTMLDivElement> {
  symbol: React.ReactNode
  /** The network the asset lives on. Always show it. */
  network?: React.ReactNode
}

const AssetRowText = React.forwardRef<HTMLDivElement, AssetRowTextProps>(
  ({ className, symbol, network, ...props }, ref) => (
    <div className={cn("min-w-0 flex-1", className)} ref={ref} {...props}>
      <p className="truncate text-sm font-semibold leading-tight">{symbol}</p>
      {network ? (
        <p className="truncate text-xs leading-tight text-muted-foreground">
          {network}
        </p>
      ) : null}
    </div>
  )
)
AssetRowText.displayName = "AssetRowText"

/** Right-aligned balance, value, or chevron. */
const AssetRowTrailing = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "ml-auto flex shrink-0 flex-col items-end gap-0.5 text-right [&_svg]:size-4 [&_svg]:text-muted-foreground",
      className
    )}
    {...props}
  />
))
AssetRowTrailing.displayName = "AssetRowTrailing"

const AssetRowAmount = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("font-mono text-sm font-medium tabular-nums", className)}
    {...props}
  />
))
AssetRowAmount.displayName = "AssetRowAmount"

const AssetRowSubtext = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("text-xs text-muted-foreground", className)}
    {...props}
  />
))
AssetRowSubtext.displayName = "AssetRowSubtext"

export {
  AssetRow,
  AssetRowAvatar,
  AssetRowText,
  AssetRowTrailing,
  AssetRowAmount,
  AssetRowSubtext,
}
