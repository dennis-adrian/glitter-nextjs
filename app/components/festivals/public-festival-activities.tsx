"use client";

import PublicFestivalActivityDetail from "@/app/components/festivals/public-festival-activity-detail";
import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import { FullFestival } from "@/app/data/festivals/definitions";
import { use, useState } from "react";
import { Input } from "@/app/components/ui/input";
import { SearchIcon } from "lucide-react";

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
	const [term, setTerm] = useState("");
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
							<div>
								<div className="flex flex-col gap-1 my-4">
									<h4 className="text-base md:text-lg font-medium">
										Participantes
									</h4>
									<p className="text-sm text-muted-foreground">
										Selecciona a los participantes que ya visitaste para guiarte
										y completar la actividad más rápido.
									</p>
								</div>
								<div className="flex flex-col gap-1 mb-2">
									<label
										htmlFor="search"
										className="text-sm text-muted-foreground"
									>
										Buscar participantes
									</label>
									<div className="relative flex w-full md:max-w-96">
										<Input
											placeholder="Busca por nombre o espacio"
											className="peer pl-10"
											type="search"
											onChange={(e) => {
												e.preventDefault();
												setTerm(e.target.value);
											}}
										/>
										<div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
											<SearchIcon aria-hidden="true" className="h-4 w-4" />
										</div>
									</div>
								</div>
								<ul>
									{details.map((detail) => (
										<PublicFestivalActivityDetail
											key={detail.id}
											festival={festival}
											detail={detail}
											reservations={reservations}
											searchTerm={term}
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
