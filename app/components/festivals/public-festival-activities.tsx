"use client";

import PublicFestivalActivityDetail from "@/app/components/festivals/public-festival-activity-detail";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { FullFestival } from "@/app/data/festivals/definitions";
import { use } from "react";

type PublicFestivalActivitiesProps = {
	festival: FullFestival;
	fetchFestivalReservationsPromise: Promise<
		ReservationWithParticipantsAndUsersAndStand[]
	>;
};

export default function PublicFestivalActivities({
	festival,
	fetchFestivalReservationsPromise,
}: PublicFestivalActivitiesProps) {
	const activities = festival.festivalActivities;
	const reservations = use(fetchFestivalReservationsPromise);

	return (
		<div className="my-4">
			<div>
				{activities.map((activity) => {
					const { details } = activity;
					return (
						<div key={activity.id}>
							<h3 className="text-lg md:text-xl font-semibold">
								{activity.name}
							</h3>
							<p className="text-sm text-muted-foreground">
								{activity.visitorsDescription}
							</p>
							<div className="my-4">
								<h4 className="text-base md:text-lg font-medium mb-3">
									Participantes
								</h4>
								<ul>
									{details.map((detail) => (
										<PublicFestivalActivityDetail
											key={detail.id}
											detail={detail}
											reservations={reservations}
										/>
									))}
								</ul>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
