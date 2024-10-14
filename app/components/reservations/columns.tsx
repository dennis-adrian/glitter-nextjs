"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments } from "@/app/api/reservations/definitions";
import { ActionsCell } from "@/app/components/reservations/cells/actions";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { formatFullDate } from "@/app/lib/formatters";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import PaymentStatus from "@/app/components/reservations/cells/payment-status";

export const columnTitles = {
  artists: "Participantes",
  createdAt: "Creación",
  festivalId: "Festival",
  id: "ID",
  stand: "Espacio",
  status: "Estado de la Reserva",
  paymentStatus: "Estado del Pago",
};

export const columns: ColumnDef<ReservationWithParticipantsAndUsersAndStandAndFestivalAndInvoicesWithPayments>[] =
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
      cell: ({ row }) =>
        row.original.participants.map(({ user: profile }) => (
          <TooltipProvider key={profile.id}>
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={profile.imageUrl || "/img/profile-avatar.png"}
                    alt={profile.displayName || "avatar"}
                  />
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <ProfileQuickViewInfo className="p-4" profile={profile} />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )),
    },
    {
      id: "festivalId",
      accessorKey: "festivalId",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.festivalId}
        />
      ),
      cell: ({ row }) => row.original.festival.name,
      filterFn: (row, columnId, filterFestival) => {
        if (filterFestival.length === 0) return true;
        const festivalId = row.getValue(columnId);
        return filterFestival.includes(festivalId?.toString());
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.status} />
      ),
      cell: ({ row }) => <ReservationStatus reservation={row.original} />,
      filterFn: (row, columnId, filterStatus) => {
        if (!filterStatus) return true;
        const status = row.getValue(columnId);
        return filterStatus === status;
      },
    },
    {
      accessorKey: "paymentStatus",
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.paymentStatus}
        />
      ),
      cell: ({ row }) => <PaymentStatus invoices={row.original.invoices} />,
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
