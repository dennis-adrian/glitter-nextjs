"use client";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import TableActions from "@/app/components/organisms/festivals/table-actions";
import { FestivalWithDates } from "@/app/data/festivals/definitions";
import { ColumnDef } from "@tanstack/react-table";

const columnTitles = {
  name: "Nombre",
  status: "Estado",
  location: "Ubicación",
  actions: "",
};

export const columns: ColumnDef<FestivalWithDates>[] = [
  {
    header: columnTitles.name,
    accessorKey: "name",
  },
  {
    header: columnTitles.status,
    accessorKey: "status",
    cell: ({ row }) => <FestivalStatusBadge status={row.original.status} />,
  },
  {
    header: columnTitles.location,
    accessorKey: "locationLabel",
  },
  {
    header: columnTitles.actions,
    accessorKey: "actions",
    cell: ({ row }) => <TableActions festival={row.original} />,
  },
];
