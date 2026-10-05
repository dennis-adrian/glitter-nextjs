import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import FestivalActivityCard from "@/app/components/participant_dashboard/activity-card/card";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/queries";
import { scopeActivityToViewer } from "@/app/lib/festivals/utils";

type FestivalActivitiesProps = {
  festivalId: number;
  forProfile: BaseProfile;
};

export default async function FestivalActivities({
  festivalId,
  forProfile,
}: FestivalActivitiesProps) {
  // The cards are client components: each activity keeps only what this
  // profile may see of the other participants.
  const activities = (
    await fetchFestivalActivitiesByFestivalId(festivalId)
  ).map((activity) => scopeActivityToViewer(activity, forProfile.id));

  if (activities.length === 0) return null;

  return (
    <section className="w-full">
      <Heading level={2}>Actividades del festival</Heading>
      <div className="mt-4 grid">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {activities.map((activity) => (
            <FestivalActivityCard
              key={activity.id}
              activity={activity}
              forProfile={forProfile}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
