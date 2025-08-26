import { Skeleton } from "@/components/ui/skeleton";

export function UserProfileSkeleton() {
  return (
		<div className="container p-3 md:p-6 flex flex-col gap-2">
			<Skeleton className="h-24 md:h-16 w-full" />
			<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
				<Skeleton className="h-96 w-full" />
				<Skeleton className="h-96 w-full" />
			</div>
		</div>
	);
}
