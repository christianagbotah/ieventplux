import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * iEventPlux button contract:
 * - consistent 48px default hit target across public / organizer / admin
 * - focused keyboard actions are always discoverable
 * - async buttons expose a busy state and cannot submit twice
 * - asChild remains a single Radix Slot child (never adds a spinner sibling)
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-normal text-center rounded-xl text-base font-semibold tracking-[-0.01em] outline-none transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_2px_7px_rgb(4_94_76_/_0.17)] hover:bg-primary/90 hover:shadow-[0_5px_15px_rgb(4_94_76_/_0.2)]",
        premium: "bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white shadow-[0_4px_14px_rgb(4_94_76_/_0.22)] hover:brightness-110 hover:shadow-lg",
        destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/30",
        outline: "border border-border bg-card text-foreground shadow-[0_1px_3px_rgb(16_35_51_/_0.05)] hover:border-primary/45 hover:bg-primary/5 hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75",
        soft: "border border-primary/15 bg-primary/10 text-primary shadow-none hover:border-primary/30 hover:bg-primary/15",
        ghost: "text-foreground hover:bg-secondary/70 hover:text-foreground",
        link: "h-auto rounded-md px-1 text-primary underline-offset-4 shadow-none hover:underline",
      },
      size: {
        default: "min-h-12 h-auto py-2.5 px-4 has-[>svg]:px-3.5",
        sm: "h-9 min-h-9 gap-1.5 rounded-lg px-3 text-xs sm:text-sm has-[>svg]:px-2.5",
        lg: "min-h-12 h-auto py-3 rounded-xl px-6 text-base has-[>svg]:px-5",
        icon: "size-12",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-12 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Prevent a double action and announce the async state to assistive technology. */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled = false,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? "default"}
      data-size={size ?? "default"}
      data-loading={loading ? "true" : undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {asChild ? children : <>
        {loading && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
        {children}
      </>}
    </Comp>
  )
}

export { Button, buttonVariants }
