import { Skeleton } from "@/app/components/ui/skeleton";

export default function CartItemSkeleton() {
	return (
		<div className="flex gap-3 py-4 border-b">
			<Skeleton className="w-16 h-16 rounded-md shrink-0" />
			<div className="flex-1 space-y-2">
				<Skeleton className="h-4 w-3/4" />
				<Skeleton className="h-3 w-1/3" />
				<div className="flex items-center gap-2 mt-3">
					<Skeleton className="h-7 w-7 rounded-md" />
					<Skeleton className="h-4 w-5" />
					<Skeleton className="h-7 w-7 rounded-md" />
				</div>
			</div>
			<div className="flex flex-col items-end gap-2">
				<Skeleton className="h-4 w-14" />
				<Skeleton className="h-7 w-7 rounded-md" />
			</div>
		</div>
	);
}
