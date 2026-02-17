import { Skeleton } from "@/app/components/ui/skeleton";

export default function SectorSelectionSkeleton() {
	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
			<div className="border-b bg-background px-4 py-3">
				<div className="mx-auto max-w-3xl">
					<Skeleton className="h-3 w-32" />
					<Skeleton className="mt-2 h-1.5 w-full rounded-full" />
				</div>
			</div>

			<div className="flex-1 px-4 py-4 md:py-6">
				<div className="mx-auto max-w-3xl">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="mt-1 h-4 w-full max-w-md" />

					<div className="mt-3 md:mt-5">
						<Skeleton className="h-10 w-40 rounded-md" />
					</div>

					<div className="mt-3 md:mt-5">
						<Skeleton className="h-6 w-56" />
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
							<Skeleton className="h-24 rounded-lg" />
							<Skeleton className="h-24 rounded-lg" />
							<Skeleton className="h-24 rounded-lg" />
							<Skeleton className="h-24 rounded-lg" />
						</div>
					</div>
				</div>
			</div>

			<div className="sticky bottom-0 border-t bg-background p-4">
				<div className="mx-auto max-w-3xl">
					<Skeleton className="h-12 w-full rounded-md" />
				</div>
			</div>
		</div>
	);
}
