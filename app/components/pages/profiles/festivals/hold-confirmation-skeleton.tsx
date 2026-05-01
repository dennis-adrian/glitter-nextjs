import { Skeleton } from "@/app/components/ui/skeleton";

export default function HoldConfirmationSkeleton() {
	return (
		<div className="flex min-h-[calc(100dvh-4rem)] flex-col">
			<div className="border-b bg-background px-4 py-3">
				<div className="mx-auto max-w-3xl space-y-2">
					<Skeleton className="h-4 w-36" />
					<Skeleton className="h-1.5 w-full" />
				</div>
			</div>

			<div className="flex-1 px-4 py-4 md:py-6">
				<div className="mx-auto max-w-lg">
					<Skeleton className="mb-4 h-[68px] rounded-lg md:mb-6" />

					<Skeleton className="mb-3 h-6 w-44" />

					<div className="mb-3 rounded-xl border bg-card p-6 shadow-sm">
						<div className="flex gap-4">
							<div className="flex-1 space-y-3">
								<div className="space-y-1">
									<Skeleton className="h-3 w-28" />
									<Skeleton className="h-5 w-36" />
								</div>
								<div className="space-y-1">
									<Skeleton className="h-3 w-20" />
									<Skeleton className="h-5 w-32" />
								</div>
							</div>
							<Skeleton className="h-24 w-24 shrink-0 rounded-lg" />
						</div>

						<div className="mt-4 flex items-center justify-between border-t pt-4">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-6 w-24" />
						</div>
					</div>

					<div className="mb-3 flex justify-center">
						<Skeleton className="h-9 w-44" />
					</div>
				</div>
			</div>

			<div className="sticky bottom-0 border-t bg-background p-4">
				<div className="mx-auto flex max-w-lg gap-1">
					<Skeleton className="h-10 w-28" />
					<Skeleton className="h-10 flex-1" />
				</div>
			</div>
		</div>
	);
}
