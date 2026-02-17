import { Progress } from "@/app/components/ui/progress";

type StepIndicatorProps = {
	step: number;
	totalSteps: number;
	label: string;
};

export default function StepIndicator({
	step,
	totalSteps,
	label,
}: StepIndicatorProps) {
	return (
		<div className="border-b bg-background px-4 py-3">
			<div className="mx-auto max-w-3xl">
				<div className="flex items-center justify-between text-xs">
					<span className="font-bold uppercase tracking-wider text-primary">
						Paso {step} de {totalSteps}
					</span>
					<span className="text-muted-foreground">{label}</span>
				</div>
				<Progress value={(step / totalSteps) * 100} className="mt-2 h-1.5" />
			</div>
		</div>
	);
}
