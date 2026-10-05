import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * StatusPill — a compact state label for a route, an order, or a row.
 *
 * This system has no green. A finished or verified state reads as the brand
 * violet with a check, the same way the launch art treats its confirmed items.
 * Keep red for genuine failure and refusal only.
 */

const statusPillVariants = cva(
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold transition-colors [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-transparent bg-muted text-muted-foreground",
        brand: "border-transparent bg-primary text-primary-foreground",
        accent: "border-transparent bg-accent text-accent-foreground",
        outline: "border-border bg-transparent text-foreground",
        caution: "border-destructive/45 bg-destructive/15 text-foreground",
        danger: "border-transparent bg-destructive text-destructive-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.6875rem] leading-4 [&_svg]:size-3",
        default: "px-2.5 py-1 text-xs leading-4 [&_svg]:size-3.5",
      },
    },
    defaultVariants: {
      tone: "neutral",
      size: "default",
    },
  }
)

const dotToneVariants = cva("size-1.5 rounded-full", {
  variants: {
    tone: {
      neutral: "bg-muted-foreground",
      brand: "bg-primary-foreground",
      accent: "bg-accent-foreground",
      outline: "bg-foreground",
      caution: "bg-destructive",
      danger: "bg-destructive-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {
  /** Show a leading state dot. */
  dot?: boolean
  /** Animate the dot for an in-flight state. */
  pulse?: boolean
}

const StatusPill = React.forwardRef<HTMLSpanElement, StatusPillProps>(
  ({ className, tone, size, dot = false, pulse = false, children, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(statusPillVariants({ tone, size }), className)}
      {...props}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={cn(dotToneVariants({ tone }), pulse && "animate-pulse")}
        />
      ) : null}
      {children}
    </span>
  )
)
StatusPill.displayName = "StatusPill"

export { StatusPill, statusPillVariants }
