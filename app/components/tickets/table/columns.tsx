"use client";

import { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatFullDate } from "@/app/lib/formatters";
import ActionsCell from "./cells/actions";

export const columnTitles = {
  id: "ID",
  date: "Fecha",
  visitor: "Visitante",
  status: "Estado",
};

export const columns: ColumnDef<TicketWithVisitor>[] = [
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
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.id} />
    ),
  },
  {
    id: "date",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.date} />
    ),
    cell: ({ row }) => formatFullDate(row.original.date),
  },
  {
    id: "visitor",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.visitor} />
    ),
    cell: ({ row }) =>
      `${row.original.visitor.firstName} ${row.original.visitor.lastName}`,
  },
  {
    id: "status",
    header: "Asistencia",
    cell: ({ row }) => <ActionsCell ticket={row.original} />,
  },
];
