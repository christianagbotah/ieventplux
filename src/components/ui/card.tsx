import * as React from "react"
import { cn } from "@/lib/utils"

/** Consistent, quiet surfaces. Cards never imply clickability unless the view opts in. */
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card" className={cn(
      "flex min-w-0 flex-col gap-5 rounded-2xl border border-border/80 bg-card py-5 text-card-foreground shadow-[0_2px_12px_rgb(16_35_51_/_0.04),0_1px_2px_rgb(16_35_51_/_0.03)]",
      className,
    )} {...props} />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn(
    "@container/card-header grid min-w-0 auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-5 sm:px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-5",
    className,
  )} {...props} />
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-title" className={cn(
    "min-w-0 text-[15px] font-bold leading-snug tracking-[-0.02em] sm:text-base",
    className,
  )} {...props} />
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-description" className={cn(
    "text-sm leading-relaxed text-muted-foreground", className,
  )} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn(
    "col-start-2 row-span-2 row-start-1 self-start justify-self-end", className,
  )} {...props} />
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("min-w-0 px-5 sm:px-6", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn(
    "flex min-w-0 flex-wrap items-center gap-2 px-5 sm:px-6 [.border-t]:pt-5",
    className,
  )} {...props} />
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
