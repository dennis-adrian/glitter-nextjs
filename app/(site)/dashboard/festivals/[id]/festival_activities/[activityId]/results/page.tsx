import { notFound } from "next/navigation";
import { z } from "zod";

import ActivityVotingResults from "@/app/components/festivals/festival_activities/activity-voting-results";
import { fetchFestivalActivityForStaff } from "@/app/lib/festival_activites/queries";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { fetchFestivalReservationStandRefs } from "@/app/lib/reservations/queries";

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

  const activity = await fetchFestivalActivityForStaff(activityId);
  if (!activity || activity.festivalId !== festivalId) return notFound();
  if (!activity.allowsVoting) return notFound();

  const [reservations, festival] = await Promise.all([
    activity.type === "best_stand"
      ? fetchFestivalReservationStandRefs(festivalId)
      : Promise.resolve([]),
    fetchBaseFestival(festivalId),
  ]);

  return (
    <ActivityVotingResults
      activity={activity}
      reservations={reservations}
      festivalName={festival?.name}
    />
  );
}
