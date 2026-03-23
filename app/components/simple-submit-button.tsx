import { VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";
import { useFormContext } from "react-hook-form";

import { Button, buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

type SubmitButtonProps = {
	className?: string;
	children?: React.ReactNode;
	disabled: boolean;
	label?: string;
	loading?: boolean;
	loadingLabel?: string;
	submittingLabel?: string;
} & VariantProps<typeof buttonVariants>;

export default function SubmitButton({
	className,
	label,
	loading,
	loadingLabel,
	submittingLabel,
	variant,
	children,
	disabled,
	...props
}: SubmitButtonProps) {
	// useFormContext() reads HookFormContext (provided by FormProvider). Outside FormProvider
	// the context value is null; destructuring would throw—use safe defaults for isSubmitting / isLoading.
	const formContext = useFormContext() as ReturnType<
		typeof useFormContext
	> | null;
	const isSubmitting = formContext?.formState?.isSubmitting ?? false;
	const isLoading = formContext?.formState?.isLoading ?? false;

	const Loading = (
		<>
			<Loader2Icon className="w-4 h-4 animate-spin mr-2" />
			{loadingLabel || "Cargando..."}
		</>
	);

	return (
		<Button
			type="submit"
			variant={variant}
			className={cn("w-full", className)}
			disabled={isSubmitting || isLoading || disabled}
			{...props}
		>
			{isLoading || loading ? (
				Loading
			) : isSubmitting ? (
				<>
					<Loader2Icon className="w-4 h-4 animate-spin mr-2" />
					{submittingLabel || "Cargando..."}
				</>
			) : (
				<>{label || children}</>
			)}
		</Button>
	);
}
