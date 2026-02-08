import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
	return (
		<div className="container p-3 md:p-6">
			<Skeleton className="h-7 md:h-9 w-52" />
			<div className="my-2 md:my-4 w-full">
				<div className="flex flex-col gap-2">
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-20 w-full" />
					<Skeleton className="h-56 w-full" />
				</div>
			</div>
		</div>
	);
}
