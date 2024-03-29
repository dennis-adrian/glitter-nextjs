"use client";

import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { ReservationWithParticipantsAndUsersAndStand } from "@/app/api/reservations/actions";
import { EmailCell } from "@/app/components/dashboard/data_table/cells/email";
import { ActionsCell } from "@/app/components/reservations/cells/actions";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { formatFullDate } from "@/app/lib/formatters";

export const columnTitles = {
  id: "ID",
  stand: "Espacio",
  artists: "Artistas",
  createdAt: "Creación",
  status: "Estado",
  email: "Correo electrónico",
  names: "Nombres",
};

export const columns: ColumnDef<ReservationWithParticipantsAndUsersAndStand>[] =
  [
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
      id: "stand",
      accessorFn: (row) => `${row.stand.label}${row.stand.standNumber}`,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.stand} />
      ),
    },
    {
      id: "artists",
      accessorFn: (row) =>
        row.participants.map((p) => p.user.displayName).join(", "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.artists} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {row.original.participants.map((p) => (
            <span key={p.id} className="text-blue-500 underline">
              <Link href={`/dashboard/users/${p.user.id}`}>
                {p.user.displayName}
              </Link>
            </span>
          ))}
        </div>
      ),
    },
    {
      id: "email",
      accessorFn: (row) => row.participants.map((p) => p.user.email).join(", "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.email} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {row.original.participants.map((p) => (
            <EmailCell email={p.user.email} key={p.id} />
          ))}
        </div>
      ),
    },
    {
      id: "names",
      accessorFn: (row) =>
        row.participants.map((p) => p.user.displayName).join(", "),
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.names} />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {row.original.participants.map((p) => (
            <span key={p.id}>{p.user.displayName}</span>
          ))}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.status} />
      ),
      cell: ({ row }) => <ReservationStatus reservation={row.original} />,
      filterFn: (row, columnId, filterStatus) => {
        if (filterStatus.length === 0) return true;
        const status = row.getValue(columnId);
        return filterStatus.includes(status);
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.createdAt} />
      ),
      cell: ({ row }) => {
        return formatFullDate(row.original.createdAt);
      },
    },
    {
      id: "actions",
      cell: ({ row }) => <ActionsCell reservation={row.original} />,
    },
  ];
