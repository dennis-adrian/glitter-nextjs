"use client";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { RequestStatusBadge } from "@/app/components/user_requests/status-badge";
import { requestTypeLabels } from "@/app/lib/utils";
import { ActionsCell } from "@/components/user_requests/cells/actions";
import { ColumnDef } from "@tanstack/react-table";
import { CopyIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export const columnTitles = {
  id: "ID",
  user: "Usuario",
  status: "Estado",
  phoneNumber: "Teléfono",
  email: "Correo electrónico",
  festival: "Festival",
  type: "Tipo de solicitud",
};

export const columns: ColumnDef<UserRequest>[] = [
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
    filterFn: (row, columnId, filterStatus) => {
      if (filterStatus.length === 0) return true;
      const status = row.getValue(columnId);
      return filterStatus.includes(status);
    },
  },
  {
    id: "email",
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.email} />
    ),
    cell: ({ row }) => (
      <EmailCell
        email={row.original.user.email}
        key={row.original.user.email}
      />
    ),
  },
  {
    id: "phoneNumber",
    accessorKey: "phoneNumber",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.phoneNumber} />
    ),
    cell: ({ row }) => {
      const phoneNumber = row.original.user.phoneNumber;
      return <span>{phoneNumber}</span>;
    },
  },
  {
    id: "type",
    accessorFn: (row) => row.type,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.type} />
    ),
    cell: ({ row }) => {
      const type = row.original.type;
      return (
        <span key={requestTypeLabels[type]}>{requestTypeLabels[type]}</span>
      );
    },
    filterFn: (row, columnId, filterTypes) => {
      if (filterTypes.length === 0) return true;
      const type = row.getValue(columnId);
      return filterTypes.includes(type);
    },
  },
  {
    id: "festival",
    accessorFn: (row) => row.festival?.name,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.festival} />
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
