"use client";

import { UserRequest } from "@/app/api/user_requests/definitions";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { RequestStatusBadge } from "@/app/components/user_requests/status-badge";
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
  },
  {
    id: "email",
    accessorKey: "email",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.email} />
    ),
    cell: ({ row }) => {
      const email = row.original.user.email;
      return (
        <div className="flex max-w-48 sm:max-w-full">
          <span className="truncate">{email}</span>
          <CopyIcon
            onClick={() => {
              navigator.clipboard.writeText(email);
              toast.success("Copiado", {
                duration: 1000,
              });
            }}
            className="h-4 w-4 text-muted-foreground cursor-pointer ml-1"
          />
        </div>
      );
    },
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
