import * as React from "react"

import { cn } from "../../lib/utils"

/**
 * AmountField — a large numeric entry with percentage shortcuts, an asset slot
 * and a secondary converted line.
 *
 * Composed rather than configured, so a flow can drop the shortcuts, swap the
 * asset slot for anything, or make the field read-only for a quoted output
 * without a new variant. No formatting, conversion or balance logic lives here.
 */

export interface AmountFieldProps
  extends React.HTMLAttributes<HTMLDivElement> {
  invalid?: boolean
  disabled?: boolean
}

const AmountField = React.forwardRef<HTMLDivElement, AmountFieldProps>(
  ({ className, invalid = false, disabled = false, ...props }, ref) => (
    <div
      ref={ref}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-muted p-3 transition-colors",
        "focus-within:border-ring",
        invalid && "border-destructive",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    />
  )
)
AmountField.displayName = "AmountField"

const AmountFieldHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex min-h-6 items-center justify-between gap-2", className)}
    {...props}
  />
))
AmountFieldHeader.displayName = "AmountFieldHeader"

const AmountFieldLabel = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "text-xs font-medium uppercase tracking-wide text-muted-foreground",
      className
    )}
    {...props}
  />
))
AmountFieldLabel.displayName = "AmountFieldLabel"

/** The row of percentage chips. Wrap `AmountFieldShortcut` children. */
const AmountFieldShortcuts = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-1", className)}
    {...props}
  />
))
AmountFieldShortcuts.displayName = "AmountFieldShortcuts"

export interface AmountFieldShortcutProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

const AmountFieldShortcut = React.forwardRef<
  HTMLButtonElement,
  AmountFieldShortcutProps
>(({ className, active = false, type = "button", ...props }, ref) => (
  <button
    ref={ref}
    type={type}
    aria-pressed={active}
    data-active={active || undefined}
    className={cn(
      "min-h-6 rounded-full border px-2 text-[0.6875rem] font-semibold leading-4 transition-colors",
      "border-transparent bg-secondary text-secondary-foreground",
      "hover-elevate active-elevate-2",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      "disabled:pointer-events-none disabled:opacity-50",
      active && "bg-primary text-primary-foreground",
      className
    )}
    {...props}
  />
))
AmountFieldShortcut.displayName = "AmountFieldShortcut"

const AmountFieldRow = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center gap-3", className)}
    {...props}
  />
))
AmountFieldRow.displayName = "AmountFieldRow"

const AmountFieldInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, inputMode = "decimal", placeholder = "0.0", ...props }, ref) => (
  <input
    ref={ref}
    inputMode={inputMode}
    placeholder={placeholder}
    className={cn(
      "min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-2xl font-semibold tabular-nums text-foreground outline-none",
      "placeholder:text-muted-foreground",
      "disabled:cursor-not-allowed disabled:opacity-60",
      "read-only:text-muted-foreground",
      className
    )}
    {...props}
  />
))
AmountFieldInput.displayName = "AmountFieldInput"

/** Right-hand slot for the asset selector trigger. */
const AmountFieldAsset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("shrink-0", className)} {...props} />
))
AmountFieldAsset.displayName = "AmountFieldAsset"

const AmountFieldFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex min-h-4 items-center justify-between gap-2 text-xs text-muted-foreground",
      className
    )}
    {...props}
  />
))
AmountFieldFooter.displayName = "AmountFieldFooter"

/** The converted value line (fiat, reference asset, and so on). */
const AmountFieldSecondary = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span
    ref={ref}
    className={cn("font-mono tabular-nums", className)}
    {...props}
  />
))
AmountFieldSecondary.displayName = "AmountFieldSecondary"

const AmountFieldHint = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
  <span ref={ref} className={cn("truncate", className)} {...props} />
))
AmountFieldHint.displayName = "AmountFieldHint"

const AmountFieldMessage = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs font-medium text-destructive", className)}
    {...props}
  />
))
AmountFieldMessage.displayName = "AmountFieldMessage"

export {
  AmountField,
  AmountFieldHeader,
  AmountFieldLabel,
  AmountFieldShortcuts,
  AmountFieldShortcut,
  AmountFieldRow,
  AmountFieldInput,
  AmountFieldAsset,
  AmountFieldFooter,
  AmountFieldSecondary,
  AmountFieldHint,
  AmountFieldMessage,
}
