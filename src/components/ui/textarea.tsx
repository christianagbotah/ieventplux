import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-28 w-full min-w-0 resize-y rounded-xl border border-input bg-card px-3.5 py-3 text-base leading-relaxed text-foreground shadow-[0_1px_2px_rgb(16_35_51_/_0.03)] outline-none transition-[border-color,background-color,box-shadow] duration-200",
        "placeholder:text-muted-foreground/80 hover:border-primary/35 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15",
        "aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/15",
        "read-only:bg-muted/55 read-only:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted/70 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}
export { Textarea }
