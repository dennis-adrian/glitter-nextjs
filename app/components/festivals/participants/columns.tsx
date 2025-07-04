"use client";

import { ParticipationWithParticipantWithInfractionsAndReservations } from "@/app/api/users/definitions";
import ProfileCell from "@/app/components/common/table/profile-cell";
import ActionsCell from "@/app/components/festivals/participants/cells/actions-cell";
import InfractionsCell from "@/app/components/festivals/participants/cells/infractions-cell";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
	participant: "Participantes",
	reservationStatus: "Estado de la reserva",
	infractions: "Infracciones",
	stand: "Espacio",
};

export const columns: ColumnDef<ParticipationWithParticipantWithInfractionsAndReservations>[] =
	[
		{
			id: "participant",
			accessorFn: (participant) =>
				participant.user.displayName ||
				`${participant.user.firstName} ${participant.user.lastName}`,
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={columnTitles.participant}
				/>
			),
			cell: ({ row }) => <ProfileCell profile={row.original.user} />,
		},
		{
			id: "reservationStatus",
			accessorFn: (participant) => participant.reservation.status,
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={columnTitles.reservationStatus}
				/>
			),
			cell: ({ row }) => {
				return <ReservationStatus reservation={row.original.reservation} />;
			},
		},
		{
			id: "stand",
			accessorFn: (participant) =>
				`${participant.reservation.stand.label}${participant.reservation.stand.standNumber}`,
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title={columnTitles.stand} />
			),
			cell: ({ row }) => (
				<span>
					{row.original.reservation.stand.label}
					{row.original.reservation.stand.standNumber}
				</span>
			),
		},
		{
			id: "infractions",
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={columnTitles.infractions}
				/>
			),
			cell: ({ row }) => <InfractionsCell participant={row.original} />,
		},
		{
			id: "actions",
			header: ({ column }) => (
				<DataTableColumnHeader column={column} title="" />
			),
			cell: ({ row }) => <ActionsCell participant={row.original} />,
		},
	];
