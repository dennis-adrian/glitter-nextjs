import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	const rows = Array.from({ length: 3 });

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-8 md:h-10 w-40" />
				<Skeleton className="h-4 md:h-5 w-full max-w-md" />
			</div>
			<div className="mt-4 space-y-3">
				{rows.map((_, index) => (
					<Skeleton key={`orders-row-${index}`} className="h-24 w-full" />
				))}
			</div>
		</div>
	);
}
