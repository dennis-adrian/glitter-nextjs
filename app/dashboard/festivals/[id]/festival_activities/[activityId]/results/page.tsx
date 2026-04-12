import { notFound } from "next/navigation";
import { z } from "zod";

import ActivityVotingResults from "@/app/components/festivals/festival_activities/activity-voting-results";
import { fetchFestivalActivity } from "@/app/lib/festival_activites/actions";
import { fetchPublicReservationsByFestivalId } from "@/app/lib/reservations/actions";

const ParamsSchema = z.object({
	id: z.coerce.number(),
	activityId: z.coerce.number(),
});

type ResultsPageProps = {
	params: Promise<z.infer<typeof ParamsSchema>>;
};

export default async function Page({ params }: ResultsPageProps) {
	const validatedParams = ParamsSchema.safeParse(await params);
	if (!validatedParams.success) return notFound();

	const { id: festivalId, activityId } = validatedParams.data;

	const activity = await fetchFestivalActivity(activityId);
	if (!activity || activity.festivalId !== festivalId) return notFound();
	if (!activity.allowsVoting) return notFound();

	const reservations =
		activity.type === "best_stand"
			? await fetchPublicReservationsByFestivalId(festivalId)
			: [];

	return (
		<ActivityVotingResults activity={activity} reservations={reservations} />
	);
}
