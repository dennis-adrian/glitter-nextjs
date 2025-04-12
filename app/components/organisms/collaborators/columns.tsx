"use client";

import { ColumnDef } from "@tanstack/react-table";
import { ReservationCollaborationWithRelations } from "@/app/lib/collaborators/definitions";
import { formatFullDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";
import TableActions from "@/app/components/organisms/collaborators/table-actions";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
export const columnTitles = {
  arrivedAt: "Llegada",
  fullName: "Nombre",
  stand: "Stand",
  actions: "",
};

export const columns: ColumnDef<ReservationCollaborationWithRelations>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "stand",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.stand} />
    ),
    accessorFn: (row) => {
      return `${row.reservation.stand.label}${row.reservation.stand.standNumber}`;
    },
    cell: ({ row }) =>
      `${row.original.reservation.stand.label}${row.original.reservation.stand.standNumber}`,
  },
  {
    id: "fullName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.fullName} />
    ),
    accessorFn: (row) => {
      return [row.collaborator.firstName, row.collaborator.lastName].join(" ");
    },
    cell: ({ row }) => {
      const fullName = [
        row.original.collaborator.firstName,
        row.original.collaborator.lastName,
      ].join(" ");
      return fullName;
    },
    enableSorting: true,
  },
  {
    id: "arrivedAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.arrivedAt} />
    ),
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
