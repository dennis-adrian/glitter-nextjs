"use client";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { RequestStatusBadge } from "@/app/components/user_requests/status-badge";
import { ActionsCell } from "@/components/user_requests/cells/actions";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

export const columnTitles = {
  id: "ID",
  user: "Usuario",
  status: "Estado",
};

export const columns: ColumnDef<UserRequest>[] = [
  {
    accessorKey: "id",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.id} />
    ),
  },
  {
    id: "user",
    accessorFn: (row) => row.user.displayName,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.user} />
    ),
    cell: ({ row }) => (
      <Link
        className="hover:underline text-blue-500"
        href={`/dashboard/users/${row.original.user.id}`}
      >
        {row.original.user.displayName}
      </Link>
    ),
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status} />
    ),
    cell: ({ row }) => {
      const status = row.original.status;
      return <RequestStatusBadge status={status} />;
    },
  },
  {
    id: "festival",
    accessorFn: (row) => row.festival?.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Festival" />
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const request = row.original;

      return <ActionsCell request={request} />;
    },
  },
];
