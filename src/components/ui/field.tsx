import * as React from "react"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** Accessible field building blocks for consistent labels, guidance and errors. */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn("grid min-w-0 gap-1.5", className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={cn(
    "text-sm font-semibold leading-relaxed text-foreground", className,
  )} {...props} />
}

function FieldHelp({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-help" className={cn(
    "text-xs leading-relaxed text-muted-foreground", className,
  )} {...props} />
}

function FieldError({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="field-error" role="alert" className={cn(
    "text-xs font-medium leading-relaxed text-destructive", className,
  )} {...props} />
}

export { Field, FieldLabel, FieldHelp, FieldError }
