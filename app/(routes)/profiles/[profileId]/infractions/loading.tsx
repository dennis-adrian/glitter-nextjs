import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	const cards = Array.from({ length: 6 });

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-1 md:gap-2 mb-4">
				<Skeleton className="h-8 md:h-10 w-56" />
				<Skeleton className="h-4 md:h-5 w-full max-w-md" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				{cards.map((_, index) => (
					<div
						key={`infractions-card-${index}`}
						className="flex flex-col gap-3 border rounded-md p-4 bg-card shadow-md"
					>
						<Skeleton className="h-5 w-2/3" />
						<Skeleton className="h-4 w-1/2" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-24" />
					</div>
				))}
			</div>
		</div>
	);
}
