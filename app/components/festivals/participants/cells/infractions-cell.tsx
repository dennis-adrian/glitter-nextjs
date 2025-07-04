"use client";

import { ParticipationWithParticipantWithInfractionsAndReservations } from "@/app/api/users/definitions";
import { CircleAlertIcon } from "lucide-react";
import { Tooltip } from "react-tooltip";

type InfractionsCellProps = {
	participant: ParticipationWithParticipantWithInfractionsAndReservations;
};

export default function InfractionsCell({ participant }: InfractionsCellProps) {
	return (
		<div>
			<Tooltip
				id="infraction-description-tooltip"
				className="z-50 max-w-40"
				delayShow={100}
			/>
			<ul className="list-disc">
				{participant.user.infractions.map((infraction) => (
					<li key={infraction.id}>
						<span className="flex items-center gap-1">
							<span className="text-sm">{infraction.type.label}</span>
							<CircleAlertIcon
								data-tooltip-id="infraction-description-tooltip"
								data-tooltip-content={
									infraction.type.description ?? "Sin descripción"
								}
								className="w-4 h-4 text-amber-500"
							/>
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}
