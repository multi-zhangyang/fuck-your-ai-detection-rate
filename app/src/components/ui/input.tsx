import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-input bg-card/70 px-3 py-2 text-sm shadow-[inset_0_1px_1px_hsl(0_0%_0%/0.025)] transition-[border-color,background-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring/45 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35 focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.22)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
