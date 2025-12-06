import { Skeleton } from "@/app/components/ui/skeleton";

export default function BestStandActivitySkeleton() {
	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-4">
				<Skeleton className="h-6 w-80" />
				<Skeleton className="h-[200px] w-[320px] mx-auto mt-6 md:w-[500px] md:h-[320px]" />
				<Skeleton className="h-6 w-80" />
				<Skeleton className="h-[200px] w-[320px] mx-auto mt-6 md:w-[500px] md:h-[320px]" />
				<Skeleton className="h-6 w-80" />
			</div>
		</div>
	);
}
