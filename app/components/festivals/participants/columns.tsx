"use client";

import { ParticipationWithParticipantAndReservations } from "@/app/api/users/definitions";
import ProfileCell from "@/app/components/common/table/profile-cell";
import ActionsCell from "@/app/components/festivals/participants/cells/actions-cell";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
	participant: "Participantes",
	reservationStatus: "Estado de la reserva",
};

export const columns: ColumnDef<ParticipationWithParticipantAndReservations>[] = [
	{
		id: "participant",
		accessorFn: (participant) =>
			participant.user.displayName ||
			`${participant.user.firstName} ${participant.user.lastName}`,
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title={columnTitles.participant} />
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
		id: "actions",
		header: ({ column }) => <DataTableColumnHeader column={column} title="" />,
		cell: ({ row }) => <ActionsCell participant={row.original} />,
	},
];
