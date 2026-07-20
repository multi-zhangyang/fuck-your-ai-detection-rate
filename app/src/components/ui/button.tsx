import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-medium tracking-normal transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-[0_1px_2px_hsl(0_0%_0%/0.12)] hover:bg-primary/88 hover:shadow-[0_2px_8px_hsl(0_0%_0%/0.14)]",
        secondary: "border-border/80 bg-secondary text-secondary-foreground shadow-sm hover:border-foreground/15 hover:bg-accent",
        outline: "border-border/90 bg-card/70 text-foreground shadow-sm hover:border-foreground/20 hover:bg-accent/80 hover:text-accent-foreground",
        ghost: "text-muted-foreground hover:bg-accent/80 hover:text-foreground",
        destructive: "border-destructive/80 bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        neutral: "border-foreground/80 bg-foreground text-background shadow-sm hover:bg-foreground/90",
        brand: "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        success: "border-success/80 bg-success text-success-foreground shadow-sm hover:bg-success/90",
        warning: "border-warning/80 bg-warning text-warning-foreground shadow-sm hover:bg-warning/90",
        outlineBrand: "border-border/90 bg-card/70 text-foreground shadow-sm hover:border-foreground/25 hover:bg-accent/80",
        outlineSuccess: "border-success/35 bg-success/5 text-status-success hover:border-success/55 hover:bg-success/12",
        outlineWarning: "border-warning/35 bg-warning/5 text-status-warning hover:border-warning/55 hover:bg-warning/12",
        outlineDanger: "border-destructive/35 bg-card/70 text-status-danger hover:border-destructive/50 hover:bg-destructive/10",
      },
      size: {
        default: "h-9 px-3.5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-5",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
