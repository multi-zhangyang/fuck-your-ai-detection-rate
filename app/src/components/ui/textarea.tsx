import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full min-w-0 max-w-full rounded-md border border-input bg-card/70 px-3 py-2 text-sm leading-6 shadow-[inset_0_1px_1px_hsl(0_0%_0%/0.025)] transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring/45 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.22)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
