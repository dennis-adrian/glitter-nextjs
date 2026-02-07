import { Skeleton } from "@/app/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

export default function SectionSkeleton({ lines = 2 }: { lines?: number }) {
	return (
		<Card>
			<CardHeader>
				<Skeleton className="h-6 w-40" />
			</CardHeader>
			<CardContent className="space-y-3">
				{Array.from({ length: lines }).map((_, i) => (
					<Skeleton key={i} className="h-4 w-full" />
				))}
			</CardContent>
		</Card>
	);
}
