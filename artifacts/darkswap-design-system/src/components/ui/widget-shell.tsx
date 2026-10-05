import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * WidgetShell — the framed, centred panel a transactional flow lives in.
 *
 * Generic on purpose: it owns the frame, the tab bar, the settings slot and the
 * body rhythm, and nothing else. No product routes, no data, no state machine.
 */

const WidgetShell = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex w-full max-w-md flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg",
      className
    )}
    {...props}
  />
))
WidgetShell.displayName = "WidgetShell"

const WidgetShellHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-h-12 items-center gap-2 border-b px-3 py-2",
      className
    )}
    {...props}
  />
))
WidgetShellHeader.displayName = "WidgetShellHeader"

const WidgetShellTabs = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="tablist"
    className={cn("flex items-center gap-1", className)}
    {...props}
  />
))
WidgetShellTabs.displayName = "WidgetShellTabs"

export interface WidgetShellTabProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

const WidgetShellTab = React.forwardRef<
  HTMLButtonElement,
  WidgetShellTabProps
>(({ className, active = false, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    role="tab"
    aria-selected={active}
    data-active={active || undefined}
    className={cn(
      "min-h-8 rounded-md px-3 text-sm font-semibold transition-colors",
      "text-muted-foreground hover-elevate active-elevate-2",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      active && "bg-secondary text-secondary-foreground",
      className
    )}
    {...props}
  />
))
WidgetShellTab.displayName = "WidgetShellTab"

const WidgetShellActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("ml-auto flex items-center gap-1", className)}
    {...props}
  />
))
WidgetShellActions.displayName = "WidgetShellActions"

const WidgetShellBody = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-2 p-3", className)} {...props} />
))
WidgetShellBody.displayName = "WidgetShellBody"

/**
 * A hairline between two stacked fields, with room for a single centred
 * affordance (reverse direction, insert step, and so on).
 */
const WidgetShellDivider = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("relative flex h-0 items-center justify-center", className)}
    {...props}
  >
    {children ? (
      <div className="relative z-10 rounded-full bg-card p-0.5">{children}</div>
    ) : (
      <span className="h-px w-full bg-border" aria-hidden="true" />
    )}
  </div>
))
WidgetShellDivider.displayName = "WidgetShellDivider"

const WidgetShellFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-2 px-3 pb-3 pt-1", className)}
    {...props}
  />
))
WidgetShellFooter.displayName = "WidgetShellFooter"

/** A quiet, full-width strip for a summary line under the primary action. */
const WidgetShellNote = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-center text-xs text-muted-foreground", className)}
    {...props}
  />
))
WidgetShellNote.displayName = "WidgetShellNote"

export {
  WidgetShell,
  WidgetShellHeader,
  WidgetShellTabs,
  WidgetShellTab,
  WidgetShellActions,
  WidgetShellBody,
  WidgetShellDivider,
  WidgetShellFooter,
  WidgetShellNote,
}
