import { Skeleton } from "@/app/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/app/components/ui/card";

export default function DashboardSkeleton() {
	return (
		<div className="container p-3 md:p-6 space-y-6">
			{/* Welcome header */}
			<div>
				<Skeleton className="h-8 w-48 mb-1" />
				<Skeleton className="h-4 w-32" />
			</div>

			{/* Announcements banner */}
			<Skeleton className="h-16 w-full rounded-lg" />

			{/* Festival status */}
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-40" />
				</CardHeader>
				<CardContent className="space-y-3">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-10 w-32" />
				</CardContent>
			</Card>

			{/* Tasks */}
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-36" />
				</CardHeader>
				<CardContent className="space-y-3">
					<Skeleton className="h-12 w-full rounded-md" />
					<Skeleton className="h-12 w-full rounded-md" />
				</CardContent>
			</Card>

			{/* Profile overview */}
			<Card>
				<CardContent className="flex items-center gap-4 p-4">
					<Skeleton className="h-16 w-16 rounded-full" />
					<div className="space-y-2 flex-1">
						<Skeleton className="h-5 w-36" />
						<Skeleton className="h-4 w-24" />
					</div>
				</CardContent>
			</Card>

			{/* Store showcase */}
			<div>
				<Skeleton className="h-6 w-40 mb-4" />
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
					<Skeleton className="h-48 rounded-lg" />
					<Skeleton className="h-48 rounded-lg" />
					<Skeleton className="h-48 rounded-lg hidden md:block" />
					<Skeleton className="h-48 rounded-lg hidden md:block" />
				</div>
			</div>

			{/* History */}
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-44" />
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Skeleton className="h-24 rounded-md" />
						<Skeleton className="h-24 rounded-md" />
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
