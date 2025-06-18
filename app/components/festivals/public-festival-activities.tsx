import PublicFestivalActivityDetail from "@/app/components/festivals/public-festival-activity-detail";
import { FullFestival } from "@/app/data/festivals/definitions";

type PublicFestivalActivitiesProps = {
	festival: FullFestival;
};

export default function PublicFestivalActivities(
	props: PublicFestivalActivitiesProps,
) {
	const activities = props.festival.festivalActivities;
	return (
		<div className="my-4">
			<h2 className="text-2xl font-bold">Actividades</h2>
			<div>
				{activities.map((activity) => {
					const { details } = activity;
					return (
						<div key={activity.id}>
							<h3 className="text-lg font-semibold">{activity.name}</h3>
							<h4>Participantes</h4>
							<ul>
								{details.map((detail) => (
									<PublicFestivalActivityDetail
										key={detail.id}
										detail={detail}
									/>
								))}
							</ul>
						</div>
					);
				})}
			</div>
		</div>
	);
}
