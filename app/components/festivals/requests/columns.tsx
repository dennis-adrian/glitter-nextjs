"use client";

import { UserRequest } from "@/app/api/user_requests/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { RequestStatusBadge } from "@/app/components/user_requests/status-badge";
import { ActionsCell } from "@/components/user_requests/cells/actions";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

export const columnTitles = {
  user: "Usuario",
  category: "Categoría",
  status: "Estado",
  email: "Correo electrónico",
  phoneNumber: "Teléfono",
  createdAt: "Fecha de solicitud",
};

export const columns: ColumnDef<UserRequest>[] = [
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
    id: "category",
    accessorFn: (row) => row.user.category,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.category} />
    ),
    cell: ({ row }) => <CategoryBadge category={row.original.user.category} />,
  },
  {
    id: "status",
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.status} />
    ),
    cell: ({ row }) => <RequestStatusBadge status={row.original.status} />,
    filterFn: (row, columnId, filterStatus) => {
      if (filterStatus.length === 0) return true;
      const status = row.getValue(columnId);
      return filterStatus.includes(status);
    },
  },
  {
    id: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.email} />
    ),
    cell: ({ row }) => (
      <EmailCell email={row.original.user.email} key={row.original.user.email} />
    ),
  },
  {
    id: "phoneNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.phoneNumber} />
    ),
    cell: ({ row }) => <span>{row.original.user.phoneNumber}</span>,
  },
  {
    id: "createdAt",
    accessorFn: (row) => row.createdAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.createdAt} />
    ),
    cell: ({ row }) =>
      row.original.createdAt
        ? new Date(row.original.createdAt).toLocaleDateString("es-GT")
        : "—",
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionsCell request={row.original} />,
  },
];
