"use client";

import { ParticipationWithParticipantWithInfractionsAndReservations } from "@/app/api/users/definitions";
import ProfileCell from "@/app/components/common/table/profile-cell";
import ActionsCell from "@/app/components/festivals/participants/cells/actions-cell";
import InfractionsCell from "@/app/components/festivals/participants/cells/infractions-cell";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { InfractionType } from "@/app/lib/infractions/definitions";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
	participant: "Participantes",
	reservationStatus: "Estado de la reserva",
	infractions: "Infracciones",
	stand: "Espacio",
};

export const columns: ColumnDef<{
	participant: ParticipationWithParticipantWithInfractionsAndReservations;
	infractionTypes: InfractionType[];
}>[] = [
	{
		id: "participant",
		accessorFn: (row) =>
			row.participant.user.displayName ||
			`${row.participant.user.firstName} ${row.participant.user.lastName}`,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.participant} />
		),
		cell: ({ row }) => <ProfileCell profile={row.original.participant.user} />,
	},
	{
		id: "reservationStatus",
		accessorFn: (row) => row.participant.reservation.status,
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={columnTitles.reservationStatus}
			/>
		),
		cell: ({ row }) => {
			return (
				<ReservationStatus reservation={row.original.participant.reservation} />
			);
		},
	},
	{
		id: "stand",
		accessorFn: (row) =>
			`${row.participant.reservation.stand.label}${row.participant.reservation.stand.standNumber}`,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.stand} />
		),
		cell: ({ row }) => (
			<span>
				{row.original.participant.reservation.stand.label}
				{row.original.participant.reservation.stand.standNumber}
			</span>
		),
	},
	{
		id: "infractions",
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.infractions} />
		),
		cell: ({ row }) => (
			<InfractionsCell participant={row.original.participant} />
		),
	},
	{
		id: "actions",
		header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
		cell: ({ row }) => (
			<ActionsCell
				participant={row.original.participant}
				infractionTypes={row.original.infractionTypes}
			/>
		),
	},
];
