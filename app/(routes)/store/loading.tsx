import { Skeleton } from "@/app/components/ui/skeleton";

function StoreItemCardSkeleton() {
	return (
		<div className="flex flex-col gap-2">
			<Skeleton className="aspect-square w-full rounded-lg" />
			<div className="p-1 flex flex-col gap-2">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-2/3" />
				<Skeleton className="h-5 w-1/2" />
				<Skeleton className="h-8 w-full mt-1" />
			</div>
		</div>
	);
}

export default function StoreLoading() {
	return (
		<div className="container px-3 py-6">
			<div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 items-start">
				{Array.from({ length: 8 }).map((_, i) => (
					<StoreItemCardSkeleton key={i} />
				))}
			</div>
		</div>
	);
}
