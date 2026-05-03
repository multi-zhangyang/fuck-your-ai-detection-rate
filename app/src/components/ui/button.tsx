import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.08)] hover:bg-primary/90",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-accent",
        outline: "border-border bg-card text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/0.035)] hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        neutral: "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.08)] hover:bg-primary/90",
        brand: "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.08)] hover:bg-primary/90",
        success: "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.08)] hover:bg-primary/90",
        warning: "border-primary bg-primary text-primary-foreground shadow-[0_1px_0_hsl(var(--foreground)/0.08)] hover:bg-primary/90",
        outlineBrand: "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineSuccess: "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineWarning: "border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineDanger: "border-destructive/35 bg-card text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "size-10",
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
