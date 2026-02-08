import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	const tiles = Array.from({ length: 4 });

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-1 md:gap-2 mb-4">
				<Skeleton className="h-8 md:h-10 w-40" />
				<Skeleton className="h-4 md:h-5 w-full max-w-md" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="flex p-4 gap-2 w-full border rounded-md bg-card shadow-md">
					<Skeleton className="w-20 h-28 md:w-32 md:h-40" />
					<div className="flex flex-col gap-2 flex-1">
						<Skeleton className="h-5 w-2/3" />
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-4 w-48" />
						<Skeleton className="h-4 w-24 self-end" />
					</div>
				</div>
				<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
					{tiles.map((_, index) => (
						<div
							key={`history-tile-${index}`}
							className="flex flex-col border rounded-md p-4 items-center justify-center gap-2 bg-card shadow-md"
						>
							<Skeleton className="h-8 w-8 rounded-full" />
							<Skeleton className="h-3 w-20" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
