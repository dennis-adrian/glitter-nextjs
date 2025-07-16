import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center w-fit rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-default",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
				secondary:
					"border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
				outline: "text-foreground",
				dark: "border-transparent bg-gray-900 text-white hover:bg-gray-700",
				illustration: "bg-purple-100 border border-purple-300 text-purple-900",
				entrepreneurship: "bg-pink-100 border border-pink-300 text-pink-900",
				gastronomy: "bg-orange-100 border border-orange-300 text-orange-900",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
