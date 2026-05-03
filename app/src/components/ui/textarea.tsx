import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-base transition-colors placeholder:text-muted-foreground focus-visible:border-ring/45 focus-visible:outline-none focus-visible:ring-0 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.22)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
