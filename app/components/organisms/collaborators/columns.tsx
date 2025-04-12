"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { formatDate, formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import TableActions from "@/app/components/organisms/collaborators/table-actions";

export const columnTitles = {
  arrivedAt: "Llegada",
  fullName: "Nombre",
  stand: "Stand",
  actions: "",
};

export const columns: ColumnDef<ReservationCollaborationWithRelations>[] = [
  {
    header: columnTitles.stand,
    accessorKey: "stand",
    cell: ({ row }) =>
      `${row.original.reservation.stand.label}${row.original.reservation.stand.standNumber}`,
  },
  {
    header: columnTitles.fullName,
    accessorKey: "fullName",
    cell: ({ row }) => {
      const fullName = [
        row.original.collaborator.firstName,
        row.original.collaborator.lastName,
      ].join(" ");
      return fullName;
    },
  },
  {
    header: columnTitles.arrivedAt,
    accessorKey: "arrivedAt",
    cell: ({ row }) => {
      const arrivedAt = row.original.arrivedAt;
      if (!arrivedAt) return <span className="text-muted-foreground">--</span>;
      return formatFullDate(arrivedAt, DateTime.DATETIME_FULL);
    },
  },
  {
    header: columnTitles.actions,
    accessorKey: "actions",
    cell: ({ row }) => {
      return <TableActions reservationCollaboration={row.original} />;
    },
  },
];
