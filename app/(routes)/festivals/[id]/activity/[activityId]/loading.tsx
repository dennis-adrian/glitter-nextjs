import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container p-3 md:p-6">
			{/* Title */}
			<Skeleton className="h-8 w-64 mb-2" />
			{/* Description */}
			<Skeleton className="h-4 w-96 max-w-full mb-1" />
			<Skeleton className="h-4 w-72 max-w-full mb-6" />

			{/* Content block */}
			<div className="flex flex-col gap-4 mt-4">
				<Skeleton className="h-5 w-48" />
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
				<div className="flex flex-col gap-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-5/6" />
				</div>
			</div>

			{/* Action button */}
			<Skeleton className="h-10 w-full mt-8 rounded-md" />
		</div>
	);
}
