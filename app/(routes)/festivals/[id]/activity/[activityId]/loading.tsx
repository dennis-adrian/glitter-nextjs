import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container p-3 md:p-6">
			<Skeleton className="h-6 w-80" />
			<Skeleton className="h-5 w-[230px] my-2" />

			<Skeleton className="h-4 w-[250px]" />
			<Skeleton className="h-4 w-[200px]" />
			<Skeleton className="h-4 w-20" />
		</div>
	);
}
