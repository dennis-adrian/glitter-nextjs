import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const highlightVariants = cva(
	"box-decoration-clone rounded px-1 py-0.5 font-medium decoration-transparent",
	{
		variants: {
			variant: {
				neutral: "bg-amber-100 text-amber-900",
				warning: "bg-destructive/10 text-destructive",
				brand: "bg-primary-50 text-primary-700",
			},
		},
		defaultVariants: {
			variant: "neutral",
		},
	},
);

type HighlightProps = React.HTMLAttributes<HTMLElement> &
	VariantProps<typeof highlightVariants>;

const Highlight = React.forwardRef<HTMLElement, HighlightProps>(
	({ className, variant, ...props }, ref) => (
		<mark
			ref={ref}
			className={cn(highlightVariants({ variant }), className)}
			{...props}
		/>
	),
);
Highlight.displayName = "Highlight";

export { Highlight };
