import Heading from "@/app/components/atoms/heading";
import { fetchFestivalActivitiesByFestivalId } from "@/app/lib/festivals/actions";
import FestivalActivityCards from "./festival-activity-cards";

type FestivalActivititesProps = {
	festivalId: number;
};

export default async function FestivalActivitites({
	festivalId,
}: FestivalActivititesProps) {
	const activities = await fetchFestivalActivitiesByFestivalId(festivalId);

	if (activities.length === 0) return null;

	return (
		<section className="w-full">
			<Heading level={2}>Actividades del festival</Heading>
			<div className="mt-4 grid">
				<FestivalActivityCards activities={activities} />
			</div>
		</section>
	);
}
