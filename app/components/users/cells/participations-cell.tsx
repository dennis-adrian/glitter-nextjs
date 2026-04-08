"use client";

import { useState } from "react";

import { Participation } from "@/app/api/users/definitions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import { getGroupedParticipationsByFestival } from "@/app/components/users/utils";
import Link from "next/link";

type Props = {
	participations: Participation[];
};

export default function ParticipationsCell({ participations }: Props) {
	const [open, setOpen] = useState(false);

	const groupedParticipationsByFestival =
		getGroupedParticipationsByFestival(participations);

	const count = groupedParticipationsByFestival.length;

	if (count === 0) {
		return <span>0 participaciones</span>;
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<span className="underline cursor-pointer">
					{count} participaciones
				</span>
			</DialogTrigger>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Participaciones del usuario</DialogTitle>
				</DialogHeader>

				<div className="overflow-x-auto">
					<table className="w-full text-sm border">
						<thead>
							<tr className="border-b">
								<th className="p-2 text-left">Festival</th>
								<th className="p-2 text-left">Reservas</th>
								<th className="p-2 text-left">Stands</th>
								<th className="p-2 text-left">Estado</th>
							</tr>
						</thead>
						<tbody>
							{groupedParticipationsByFestival.map((festival) => (
								<tr key={festival.festivalId} className="border-b">
									<td className="p-2">
										<Link
											href={`/festivals/${festival.festivalId}`}
											className="text-blue-600 underline"
											target="_blank"
											rel="noopener noreferrer"
										>
											{festival.festivalName}
										</Link>
									</td>
									<td className="p-2">{festival.reservationsCount}</td>
									<td className="p-2">{festival.stands.join(", ")}</td>
									<td className="p-2">
										<div className="flex flex-wrap gap-1">
											{festival.statuses.map((status) => (
												<ReservationStatusBadge key={status} status={status} />
											))}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</DialogContent>
		</Dialog>
	);
}
