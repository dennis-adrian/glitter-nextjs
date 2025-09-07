"use client";

import FestivalStatusBadge from "@/app/components/atoms/festival-status-badge";
import TableActions from "@/app/components/organisms/festivals/table-actions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

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
    cell: ({ row }) => (
      <Link
        href={`/dashboard/festivals/${row.original.id}`}
        className="text-blue-600 hover:underline"
        target="_blank"
      >
        {row.original.name}
      </Link>
    ),
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
