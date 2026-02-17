import { Skeleton } from "@/app/components/ui/skeleton";

export default function HoldConfirmationSkeleton() {
	return (
		<div className="container max-w-lg mx-auto p-4 md:p-6">
			<Skeleton className="rounded-lg h-[72px] mb-6" />

			<Skeleton className="h-6 w-40 mb-3" />

			<div className="rounded-xl bg-card p-5 mb-6">
				<div className="flex gap-4">
					<div className="flex-1 space-y-3">
						<div className="space-y-1">
							<Skeleton className="h-3 w-24" />
							<Skeleton className="h-4 w-28" />
						</div>
						<div className="space-y-1">
							<Skeleton className="h-3 w-20" />
							<Skeleton className="h-4 w-32" />
						</div>
					</div>
					<Skeleton className="w-24 h-24 shrink-0 rounded-lg" />
				</div>
				<div className="flex items-center justify-between mt-4 pt-4">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-6 w-20" />
				</div>
			</div>

			<div className="flex flex-col gap-3">
				<Skeleton className="h-11 w-full" />
				<Skeleton className="h-11 w-full" />
			</div>
		</div>
	);
}
