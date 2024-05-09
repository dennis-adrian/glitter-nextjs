"use client";

import { ColumnDef } from "@tanstack/react-table";

import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { TicketWithVisitor } from "@/app/data/tickets/actions";
import { formatFullDate, formatDateWithTime } from "@/app/lib/formatters";
import ActionsCell from "./cells/actions";

export const columnTitles = {
  id: "ID",
  date: "Fecha de la entrada",
  visitor: "Visitante",
  status: "Asistencia",
  creationDate: "Fecha de creación",
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
    accessorFn: (ticket) => formatFullDate(ticket.date),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.date} />
    ),
    cell: ({ row }) => formatFullDate(row.original.date),
    filterFn: (row, columnId, filterDate) => {
      if (filterDate.length === 0) return true;
      const date = row.getValue(columnId);
      return filterDate.includes(date);
    },
  },
  {
    id: "visitor",
    accessorFn: (ticket) =>
      `${ticket.visitor.firstName} ${ticket.visitor.lastName}`,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.visitor} />
    ),
    cell: ({ row }) =>
      `${row.original.visitor.firstName} ${row.original.visitor.lastName}`,
  },
  {
    id: "status",
    accessorFn: (ticket) => ticket.status,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status} />
    ),
    cell: ({ row }) => <ActionsCell ticket={row.original} />,
    enableHiding: false,
    filterFn: (row, columnId, filterStatus) => {
      if (!filterStatus) return true;
      const role = row.getValue(columnId);
      return filterStatus.includes(role);
    },
  },
  {
    id: "creationDate",
    accessorFn: (ticket) => formatDateWithTime(ticket.createdAt),
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.creationDate}
      />
    ),
    cell: ({ row }) => formatDateWithTime(row.original.createdAt),
  },
];
