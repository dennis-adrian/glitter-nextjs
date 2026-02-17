import { Skeleton } from "@/app/components/ui/skeleton";

export default function SectorReservationSkeleton() {
	return (
		<div className="max-w-3xl mx-auto">
			<div className="border-b bg-background px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<Skeleton className="h-3 w-32" />
					<Skeleton className="mt-2 h-1.5 w-full" />
				</div>
			</div>
			<div className="container px-4 py-4 md:py-6">
				<div className="flex flex-col items-center gap-2">
					<div className="self-start flex flex-col gap-2">
						<div className="flex gap-2 items-center flex-wrap">
							<Skeleton className="h-6 w-40" />
							<Skeleton className="h-5 w-14 rounded-full" />
							<Skeleton className="h-5 w-14 rounded-full" />
						</div>
					</div>
					<Skeleton className="h-[200px] w-full md:max-w-2xl md:h-[320px] mx-auto" />
					<div className="flex flex-col gap-1.5 w-full max-w-[400px]">
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-full" />
					</div>
				</div>
			</div>
		</div>
	);
}
