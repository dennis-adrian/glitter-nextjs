import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
	"relative w-full rounded-lg border p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4",
	{
		variants: {
			variant: {
				default: "bg-primary-50/60 border border-primary-200 text-primary-600",
				destructive:
					"border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

const AlertContext = React.createContext<
	VariantProps<typeof alertVariants>["variant"] | undefined
>(undefined);

const Alert = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
	<AlertContext.Provider value={variant}>
		<div
			ref={ref}
			role="alert"
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	</AlertContext.Provider>
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => {
	const alertVariant = React.useContext(AlertContext);
	return (
		<h5
			ref={ref}
			className={cn(
				"mb-1 font-medium leading-none tracking-tight",
				(!alertVariant || alertVariant === "default") && "text-primary-600",
				className,
			)}
			{...props}
		/>
	);
});
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
	HTMLParagraphElement,
	React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
	const alertVariant = React.useContext(AlertContext);
	return (
		<div
			ref={ref}
			className={cn(
				"text-sm [&_p]:leading-relaxed",
				(!alertVariant || alertVariant === "default") && "text-foreground",
				className,
			)}
			{...props}
		/>
	);
});
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
