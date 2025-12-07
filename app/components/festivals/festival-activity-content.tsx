"use client";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/definitions";
import Title from "@/app/components/atoms/title";
import PublicFestivalActivityDetail from "@/app/components/festivals/public-festival-activity-detail";
import { Input } from "@/app/components/ui/input";
import {
	FestivalActivityWithDetailsAndParticipants,
	FullFestival,
} from "@/app/lib/festivals/definitions";
import { SearchIcon } from "lucide-react";
import { useState } from "react";

type FestivalActivityContentProps = {
	activity: FestivalActivityWithDetailsAndParticipants;
	reservations: ReservationWithParticipantsAndUsersAndStand[];
	festival: FullFestival;
};
export default function FestivalActivityContent({
	activity,
	reservations,
	festival,
}: FestivalActivityContentProps) {
	const [term, setTerm] = useState("");
	const { details } = activity;

	return (
		<div>
			<div>
				<div className="flex flex-col my-4">
					<Title level="h3">Participantes</Title>
					<p className="text-muted-foreground">
						Selecciona a los participantes que ya visitaste para guiarte y
						completar la actividad más rápido.
					</p>
				</div>
				<div className="flex flex-col gap-1 mb-2">
					<label htmlFor="search" className="text-sm text-muted-foreground">
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
					{details.map((detail, index) => (
						<PublicFestivalActivityDetail
							key={detail.id}
							festival={festival}
							detail={detail}
							reservations={reservations}
							searchTerm={term}
							detailIndex={index}
							showVariantHeader={details.length > 1}
						/>
					))}
				</ul>
			</div>
		</div>
	);
}
