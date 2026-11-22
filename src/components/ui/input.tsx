import * as React from "react"
import { cn } from "@/lib/utils"

/** Input remains 16px on touch devices to prevent iOS Safari zooming the page. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 min-h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2 text-base text-foreground shadow-[0_1px_2px_rgb(16_35_51_/_0.03)] outline-none transition-[border-color,background-color,box-shadow] duration-200",
        "placeholder:text-muted-foreground/80 hover:border-primary/35 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15",
        "read-only:bg-muted/55 read-only:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-60 md:text-sm",
        "selection:bg-primary selection:text-primary-foreground",
        "file:mr-3 file:inline-flex file:h-8 file:cursor-pointer file:items-center file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-semibold file:text-secondary-foreground",
        className,
      )}
      {...props}
    />
  )
}
export { Input }
