import { Card, CardContent, CardHeader } from "@/app/components/ui/card";
import { Skeleton } from "@/app/components/ui/skeleton";

export default function OrdersSkeleton() {
	return (
		<div className="space-y-2">
			{Array.from({ length: 3 }).map((_, i) => (
				<Card key={i}>
					<CardHeader className="pb-3">
						<div className="flex justify-between items-start gap-4">
							<div className="space-y-2">
								<Skeleton className="h-5 w-28" />
								<Skeleton className="h-4 w-44" />
							</div>
							<Skeleton className="h-6 w-20 rounded-full" />
						</div>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-4 w-52" />
							<Skeleton className="h-4 w-48" />
						</div>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
