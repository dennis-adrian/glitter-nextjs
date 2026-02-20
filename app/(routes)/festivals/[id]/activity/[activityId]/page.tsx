import Title from "@/app/components/atoms/heading";
import FestivalActivityContent from "@/app/components/festivals/festival-activity-content";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { fetchFestival } from "@/app/lib/festivals/actions";
import { fetchPublicReservationsByFestivalId } from "@/app/lib/reservations/actions";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type PageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: PageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) notFound();

	const { id: festivalId, activityId } = validatedParams.data;

	const activity = await fetchFestivalActivity(activityId);
	const festival = await fetchFestival({
		id: festivalId,
		acceptedUsersOnly: true,
	});

	if (!activity || !festival) notFound();

	const reservations = await fetchPublicReservationsByFestivalId(festivalId);

	return (
		<div className="container p-3 md:p-6">
			<Title>{activity.name}</Title>
			<p className="text-muted-foreground">{activity.visitorsDescription}</p>

			<FestivalActivityContent
				activity={activity}
				reservations={reservations}
				festival={festival}
			/>
		</div>
	);
}
