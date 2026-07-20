import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium leading-5 tracking-normal transition-colors",
  {
    variants: {
      variant: {
        default: "border-border/80 bg-muted/80 text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.03)]",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border/80 bg-card/70 text-foreground",
        neutral: "border-foreground/10 bg-foreground text-background",
        brand: "border-border bg-muted text-foreground",
        info: "border-border bg-muted text-muted-foreground",
        success: "border-success/30 bg-success/10 text-status-success",
        warning: "border-warning/30 bg-warning/10 text-status-warning",
        danger: "border-destructive/30 bg-destructive/10 text-status-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
