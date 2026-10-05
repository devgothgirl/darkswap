import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

/**
 * CautionBanner — an inline notice that sits inside a flow, not above the page.
 *
 * Use it where the warning belongs: beside the field or action it qualifies.
 * Tones are ordered by weight, and the icon is decorative — the text must carry
 * the meaning on its own.
 */

const cautionBannerVariants = cva(
  "flex w-full gap-3 rounded-lg border p-3 text-sm",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-foreground",
        brand: "border-primary/40 bg-accent/70 text-foreground",
        caution: "border-destructive/40 bg-destructive/10 text-foreground",
        danger: "border-destructive bg-destructive/15 text-foreground",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  }
)

const cautionBannerIconVariants = cva("mt-0.5 shrink-0 [&_svg]:size-4", {
  variants: {
    tone: {
      neutral: "text-muted-foreground",
      brand: "text-accent-foreground",
      caution: "text-destructive",
      danger: "text-destructive",
    },
  },
  defaultVariants: { tone: "neutral" },
})

export interface CautionBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cautionBannerVariants> {
  /** Decorative leading icon. The copy must stand without it. */
  icon?: React.ReactNode
}

const CautionBanner = React.forwardRef<HTMLDivElement, CautionBannerProps>(
  ({ className, tone, icon, children, ...props }, ref) => (
    <div
      ref={ref}
      role={tone === "danger" ? "alert" : "status"}
      className={cn(cautionBannerVariants({ tone }), className)}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className={cn(cautionBannerIconVariants({ tone }))}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
    </div>
  )
)
CautionBanner.displayName = "CautionBanner"

const CautionBannerTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm font-semibold leading-tight", className)}
    {...props}
  />
))
CautionBannerTitle.displayName = "CautionBannerTitle"

const CautionBannerDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-snug text-muted-foreground", className)}
    {...props}
  />
))
CautionBannerDescription.displayName = "CautionBannerDescription"

const CautionBannerActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-wrap items-center gap-2 pt-1", className)}
    {...props}
  />
))
CautionBannerActions.displayName = "CautionBannerActions"

export {
  CautionBanner,
  CautionBannerTitle,
  CautionBannerDescription,
  CautionBannerActions,
  cautionBannerVariants,
}
