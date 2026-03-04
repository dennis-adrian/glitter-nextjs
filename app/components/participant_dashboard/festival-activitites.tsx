import Heading from "@/app/components/atoms/heading";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import FestivalActivityCards from "./festival-activity-cards";
import { BaseProfile } from "@/app/api/users/definitions";

type FestivalActivitiesProps = {
	festivalId: number;
	forProfile: BaseProfile;
};

export default async function FestivalActivitites({
	festivalId,
	forProfile,
}: FestivalActivitiesProps) {
	const activities = await fetchFestivalActivitiesByFestivalId(festivalId);

	if (activities.length === 0) return null;

	return (
		<section className="w-full">
			<Heading level={2}>Actividades del festival</Heading>
			<div className="mt-4 grid">
				<FestivalActivityCards
					activities={activities}
					forProfile={forProfile}
				/>
			</div>
		</section>
	);
}
