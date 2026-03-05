import { BaseProfile } from "@/app/api/users/definitions";
import Heading from "@/app/components/atoms/heading";
import FestivalActivityCard from "@/app/components/participant_dashboard/activity-card/card";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";

type FestivalActivitiesProps = {
	festivalId: number;
	forProfile: BaseProfile;
};

export default async function FestivalActivities({
	festivalId,
	forProfile,
}: FestivalActivitiesProps) {
	const activities = await fetchFestivalActivitiesByFestivalId(festivalId);

	if (activities.length === 0) return null;

	return (
		<section className="w-full">
			<Heading level={2}>Actividades del festival</Heading>
			<div className="mt-4 grid">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
					{activities.map((activity, index) => (
						<FestivalActivityCard
							key={activity.id}
							activity={activity}
							forProfile={forProfile}
							index={index}
						/>
					))}
				</div>
			</div>
		</section>
	);
}
