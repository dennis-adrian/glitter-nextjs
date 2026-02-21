"use client";

import { Progress } from "@/app/components/ui/progress";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

type StepIndicatorProps = {
	step: number;
	totalSteps: number;
	backLabel?: string;
	backHref?: string;
	onBack?: () => void;
};

export default function StepIndicator({
	step,
	totalSteps,
	backLabel,
	backHref,
	onBack,
}: StepIndicatorProps) {
	const showBack = backLabel && (backHref || onBack);

	return (
		<div className="border-b bg-background px-4 py-3">
			<div className="mx-auto max-w-3xl">
				<div className="flex items-center justify-between text-xs">
					{showBack &&
						(onBack ? (
							<button
								type="button"
								onClick={onBack}
								className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
								aria-label={backLabel}
							>
								<ArrowLeftIcon className="h-3.5 w-3.5" />
								<span>{backLabel}</span>
							</button>
						) : backHref ? (
							<Link
								href={backHref}
								className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
								aria-label={backLabel}
							>
								<ArrowLeftIcon className="h-3.5 w-3.5" />
								<span>{backLabel}</span>
							</Link>
						) : null)}
					<span className="font-bold uppercase tracking-wider text-primary">
						Paso {step} de {totalSteps}
					</span>
				</div>
				<Progress value={(step / totalSteps) * 100} className="mt-2 h-1.5" />
			</div>
		</div>
	);
}
