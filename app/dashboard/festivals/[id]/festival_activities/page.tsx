import ActivityDetails from "@/app/dashboard/festivals/[id]/festival_activities/activity-details";
import { fetchFullFestivalById } from "@/app/lib/festival_sectors/actions";
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
				<h1 className="mb-2 text-2xl font-bold md:text-3xl">
					Actividades del festival
				</h1>
				<p>No hay actividades para este festival</p>
			</div>
		);
	}

	return (
		<div className="container p-4 md:p-6">
			<h1 className="mb-2 text-2xl font-bold md:text-3xl">
				Actividades del festival
			</h1>
			{festival.festivalActivities.map((activity) => (
				<div
					key={activity.id}
					className="border border-border rounded-md p-3 my-3"
				>
					<h2 className="text-lg font-semibold mb-3 leading-tight">
						{activity.name}
					</h2>
					<ActivityDetails activity={activity} />
				</div>
			))}
		</div>
	);
}
