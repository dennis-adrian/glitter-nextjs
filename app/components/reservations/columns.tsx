"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColumnDef } from "@tanstack/react-table";

import { FullReservation } from "@/app/api/reservations/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { ActionsCell } from "@/app/components/reservations/cells/actions";
import PaymentStatus from "@/app/components/reservations/cells/payment-status";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import { Checkbox } from "@/app/components/ui/checkbox";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import ProfileQuickViewInfo from "@/app/components/users/profile-quick-view-info";
import { RESERVATION_EXPIRATION_HOURS } from "@/app/lib/constants";
import { getExternalParticipantCategoryLabel } from "@/app/lib/external_participants/definitions";
import { formatDate, formatDateWithTime } from "@/app/lib/formatters";
import { isReservationHidden } from "@/app/lib/reservations/reveal";
import { EyeOffIcon } from "lucide-react";
import {
  DisplayPaymentStatus,
  mapPaymentStatusToDisplayPaymentStatus,
} from "@/app/lib/payments/helpers";

export const columnTitles = {
  artists: "Participantes",
  createdAt: "Creación",
  festivalId: "Festival",
  id: "ID",
  stand: "Espacio",
  status: "Estado de la Reserva",
  paymentStatus: "Estado del Pago",
  expiration: "Vencimiento",
  collaborators: "Colaboradores",
  participantCategory: "Categoría",
};

export const columns: ColumnDef<FullReservation>[] = [
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
    cell: ({ row }) => {
      const reservation = row.original;
      const hidden = isReservationHidden(reservation);
      return (
        <div className="flex items-center gap-1.5">
          <span>
            {reservation.stand.label ?? ""}
            {reservation.stand.standNumber}
          </span>
          {hidden && reservation.revealAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500 text-amber-700"
                  >
                    <EyeOffIcon className="size-3" />
                    Oculta
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Oculta para los participantes hasta{" "}
                  {formatDateWithTime(reservation.revealAt)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      );
    },
  },
  {
    id: "artists",
    accessorFn: (row) =>
      [
        ...row.participants.map((p) => p.user.displayName),
        ...(row.externalParticipants?.map(
          ({ externalParticipant }) => externalParticipant.displayName,
        ) ?? []),
      ].join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.artists} />
    ),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.participants.map(({ user: profile }) => (
          <TooltipProvider key={profile.id}>
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={
                      profile?.imageUrl ||
                      "/img/placeholders/avatar-placeholder.png"
                    }
                    alt={profile.displayName || "avatar"}
                  />
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <ProfileQuickViewInfo
                  className="p-4"
                  profile={profile}
                  truncateEmail
                />
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
        {row.original.externalParticipants?.map(({ externalParticipant }) => (
          <TooltipProvider key={`external-${externalParticipant.id}`}>
            <Tooltip>
              <TooltipTrigger>
                <Avatar className="w-8 h-8">
                  <AvatarImage
                    src={
                      externalParticipant.imageUrl ||
                      "/img/placeholders/avatar-placeholder.png"
                    }
                    alt={externalParticipant.displayName || "avatar"}
                  />
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-1 p-2">
                  <span className="font-medium">
                    {externalParticipant.displayName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {getExternalParticipantCategoryLabel(externalParticipant)}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </div>
    ),
  },
  {
    id: "participantCategory",
    accessorFn: (row) =>
      [
        ...row.participants.map((p) => p.user.category),
        ...(row.externalParticipants?.map(({ externalParticipant }) =>
          getExternalParticipantCategoryLabel(externalParticipant),
        ) ?? []),
      ].join(", "),
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.participantCategory}
      />
    ),
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.participants.map((participant) => (
          <CategoryBadge
            key={`participant-category-${participant.id}`}
            category={participant.user.category}
          />
        ))}
        {row.original.externalParticipants?.map(({ externalParticipant }) => (
          <Badge
            key={`external-category-${externalParticipant.id}`}
            variant="outline"
            className="border-teal-600 text-teal-700 font-bold uppercase"
          >
            {getExternalParticipantCategoryLabel(externalParticipant)}
          </Badge>
        ))}
      </div>
    ),
    filterFn: (row, _columnId, filterCategories) => {
      if (
        !filterCategories ||
        !Array.isArray(filterCategories) ||
        filterCategories.length === 0
      )
        return true;
      const userCategories = row.original.participants.map(
        (participant) => participant.user.category,
      );
      const externalParticipantTypes =
        row.original.externalParticipants?.map(
          ({ externalParticipant }) => externalParticipant.type,
        ) ?? [];

      return [...userCategories, ...externalParticipantTypes].some((category) =>
        filterCategories.includes(category),
      );
    },
  },
  {
    id: "collaborators",
    accessorKey: "collaborators",
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.collaborators}
      />
    ),
    cell: ({ row }) => {
      const formattedCollaborators = row.original.collaborators.map((c) => ({
        name: [c.collaborator.firstName, c.collaborator.lastName].join(" "),
        idNumber: c.collaborator.identificationNumber,
      }));

      return formattedCollaborators.length > 0 ? (
        <ol className="list-decimal text-sm text-muted-foreground max-w-40">
          {formattedCollaborators.map((c) => (
            <li className="" key={c.idNumber}>
              {c.name} - {c.idNumber}
            </li>
          ))}
        </ol>
      ) : (
        "--"
      );
    },
  },
  {
    id: "festivalId",
    accessorKey: "festivalId",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.festivalId} />
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
      if (!filterStatus || filterStatus.length === 0) return true;
      const status = row.getValue(columnId);
      return filterStatus.includes(status);
    },
  },
  {
    id: "paymentStatus",
    accessorFn: (row) =>
      row.invoices.length > 0
        ? mapPaymentStatusToDisplayPaymentStatus(row.invoices[0]!, row)
        : DisplayPaymentStatus.NONE,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.paymentStatus}
      />
    ),
    cell: ({ row }) => <PaymentStatus reservation={row.original} />,
    filterFn: (row, columnId, filter) => {
      if (!filter || filter.length === 0) return true;
      const status = row.getValue(columnId);
      return filter.includes(status);
    },
  },
  {
    id: "expiration",
    accessorFn: (row) =>
      formatDate(row.createdAt)
        .plus({
          hours: RESERVATION_EXPIRATION_HOURS,
        })
        .toMillis(),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.expiration} />
    ),
    cell: ({ getValue }) => {
      const ms = getValue<number>()!;
      return formatDateWithTime(new Date(ms));
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.createdAt} />
    ),
    cell: ({ row }) => {
      return formatDateWithTime(row.original.createdAt);
    },
  },
  {
    id: "actions",
    cell: ({ row }) => <ActionsCell reservation={row.original} />,
  },
];
