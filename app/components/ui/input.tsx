import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  bottomBorderOnly?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, bottomBorderOnly, ...props }, ref) => {
    if (bottomBorderOnly) {
      return (
        <input
          type={type}
          className={cn(
            "w-full border-b border-primary-500 p-2 focus-visible:border-primary-500 focus-visible:outline-none focus-visible:border-b-2",
            className,
          )}
          ref={ref}
          {...props}
        />
      );
    }

    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
