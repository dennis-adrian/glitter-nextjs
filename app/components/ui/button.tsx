import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const baseButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full font-semibold ring-offset-background transition-colors ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // brand-primary lightens in dark mode to stay legible as text, which
        // is too pale under a white label, so the fill falls back to primary.
        cta: "bg-brand-primary text-primary-foreground hover:bg-brand-primary/90 dark:bg-primary dark:hover:bg-primary/90",
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-primary bg-transparent text-primary hover:bg-accent",
        secondary:
          "bg-accent text-primary-900 hover:bg-accent/80 dark:text-accent-foreground",
        ghost:
          "text-primary hover:bg-accent hover:text-primary-900 dark:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 text-sm",
        sm: "h-8 px-3 text-xs",
        lg: "h-12 px-6 py-3 text-base",
        icon: "size-10",
        inline: "min-h-8 px-3 py-1 text-sm",
      },
      /**
       * For labels that carry data (a festival's name, an amount, a person)
       * and can outgrow a phone: the label wraps onto more lines and the
       * button grows taller instead of running out of its box. Short labels
       * look exactly as before, since the minimum height is the fixed one.
       */
      wrap: {
        true: "h-auto max-w-full whitespace-normal text-center",
        false: "",
      },
    },
    compoundVariants: [
      { wrap: true, size: "default", className: "min-h-10" },
      { wrap: true, size: "sm", className: "min-h-8 py-1.5" },
      { wrap: true, size: "lg", className: "min-h-12" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      wrap: false,
    },
  },
);

/**
 * Merged, so `wrap`'s `h-auto` replaces the size's fixed height even where
 * the classes are used on their own (a link styled as a button) rather than
 * through `Button`, which merges again with the caller's className.
 */
const buttonVariants = (
  ...args: Parameters<typeof baseButtonVariants>
): string => cn(baseButtonVariants(...args));

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, wrap, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, wrap, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
