import Link from "next/link";
import { PlusIcon } from "lucide-react";

import ActivitySummaryCard from "@/app/components/festivals/festival_activities/activity-summary-card";
import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
import { Button } from "@/app/components/ui/button";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	id: z.coerce.number(),
});

type FestivalActivitiesPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: FestivalActivitiesPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) {
		return notFound();
	}

	const { id: festivalId } = validatedParams.data;

	const festival = await fetchFullFestivalById(festivalId);

	if (!festival) {
		return notFound();
	}

	if (festival.festivalActivities.length === 0) {
		return (
			<div className="container p-4 md:p-6">
				<div className="flex items-center justify-between mb-4">
					<h1 className="text-2xl font-bold md:text-3xl">
						Actividades del festival
					</h1>
					<Button asChild size="sm">
						<Link
							href={`/dashboard/festivals/${festivalId}/festival_activities/new`}
						>
							<PlusIcon className="w-4 h-4 mr-1" />
							Nueva actividad
						</Link>
					</Button>
				</div>
				<p className="text-muted-foreground">
					No hay actividades para este festival
				</p>
			</div>
		);
	}

	return (
		<div className="container p-4 md:p-6">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-2xl font-bold md:text-3xl">
					Actividades del festival
				</h1>
				<Button asChild size="sm">
					<Link
						href={`/dashboard/festivals/${festivalId}/festival_activities/new`}
					>
						<PlusIcon className="w-4 h-4 mr-1" />
						Nueva actividad
					</Link>
				</Button>
			</div>
			<div className="space-y-3">
				{festival.festivalActivities.map((activity) => (
					<ActivitySummaryCard
						key={activity.id}
						activity={activity}
						festivalId={festivalId}
					/>
				))}
			</div>
		</div>
	);
}
