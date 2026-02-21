import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export default function PortalLoading() {
	return (
		<div className="container p-3 md:p-6">
			{/* Header */}
			<div>
				<div className="flex items-start justify-between">
					<div className="flex flex-col gap-2">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-10 md:h-14 w-56" />
						<Skeleton className="h-4 w-36" />
					</div>
					<Skeleton className="h-8 w-28 shrink-0" />
				</div>
				<Separator className="mt-4" />
			</div>

			{/* Festival carousel */}
			<Skeleton className="w-full h-48 md:h-64 mt-4" />

			<div className="flex flex-col gap-6 mt-4">
				{/* Stats strip */}
				<div className="grid grid-cols-2 md:grid-cols-3 gap-3">
					<Skeleton className="h-20" />
					<Skeleton className="h-20" />
				</div>

				{/* Two-column content grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
					<div className="flex flex-col gap-3">
						<Skeleton className="h-6 w-36" />
						<Skeleton className="h-48 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
