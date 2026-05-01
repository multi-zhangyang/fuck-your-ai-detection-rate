import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-background [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-background/60 backdrop-blur hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        neutral: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        brand: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        success: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        warning: "bg-primary text-primary-foreground shadow-soft hover:bg-primary/90",
        outlineBrand: "border border-border bg-background/60 text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineSuccess: "border border-border bg-background/60 text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineWarning: "border border-border bg-background/60 text-foreground hover:bg-accent hover:text-accent-foreground",
        outlineDanger: "border border-destructive/30 bg-background/60 text-destructive hover:bg-destructive/5",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
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
