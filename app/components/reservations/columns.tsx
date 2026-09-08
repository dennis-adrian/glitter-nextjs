"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ColumnDef } from "@tanstack/react-table";

import {
  FullReservation,
  FullReservationWithTender,
} from "@/app/api/reservations/definitions";
import CategoryBadge from "@/app/components/category-badge";
import { ConsoleActionsCell } from "@/app/components/reservations/cells/console-actions";
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
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { summarizeReservationStands } from "@/app/lib/reservations/member-stands";
import { EyeOffIcon } from "lucide-react";
import CoverageCell from "@/app/components/payments/coverage-cell";
import ViewPaymentProofCell from "@/app/components/payments/cells/view-payment-proof-cell";
import {
  deriveCoverageState,
  type CoverageState,
} from "@/app/lib/payments/coverage";

/**
 * Coverage for the reservation's invoice, or null when it carries none.
 *
 * A reservation has exactly one invoice in every creation path, so reading the
 * first is safe — but the schema does not enforce it, so this returns null
 * rather than asserting.
 */
function reservationCoverageState(
  reservation: FullReservationWithTender,
): CoverageState | null {
  const invoice = reservation.invoices[0];
  if (!invoice || !reservation.tender) return null;
  return deriveCoverageState({
    invoiceStatus: invoice.status,
    reservationStatus: reservation.status,
    tender: reservation.tender,
    dueAt: invoice.dueAt,
  });
}

export const columnTitles = {
  artists: "Participantes",
  cashAmount: "QR",
  collaborators: "Colaboradores",
  coverage: "Cobertura",
  createdAt: "Creación",
  creditAmount: "Créditos",
  dueAt: "Vencimiento",
  features: "Extras",
  festivalId: "Festival",
  id: "ID",
  outstandingAmount: "Saldo",
  owner: "Titular",
  participantCategory: "Categoría",
  proof: "Comprobante",
  reviewAge: "En revisión desde",
  stand: "Espacio",
  status: "Estado de la Reserva",
  totalAmount: "Total",
};

function money(amount: number | undefined): string {
  return amount == null ? "--" : `Bs${amount}`;
}

/**
 * The invoice holder — who owes, and whose credits apply. Not the same
 * question as who is on the stand, which `artists` answers.
 */
function invoiceOwnerName(
  reservation: FullReservationWithTender,
): string | null {
  const user = reservation.invoices[0]?.user;
  if (!user) return null;
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

/** When the still-open settlement submission was sent, if there is one. */
function reviewWaitingSince(
  reservation: FullReservationWithTender,
): Date | null {
  const invoice = reservation.invoices[0];
  if (!invoice || invoice.status !== "verification_payment") return null;
  const latest = [...invoice.payments].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  return latest?.createdAt ?? invoice.updatedAt;
}

/**
 * The optional features charged to this reservation — the other way credits
 * attach to it, invisible on both of the previous screens.
 */
function featureSummary(reservation: FullReservationWithTender): string {
  const parts: string[] = [];
  if (reservation.members.filter((member) => !member.releasedAt).length > 1) {
    parts.push("Mesa completa");
  }
  if (reservation.bookedParticipantCount > 1) parts.push("Compartida");
  return parts.join(" · ");
}

/**
 * What the reservation occupies. Reading `row.stand` alone showed a full table
 * as a single space, because that column names only the originally selected
 * half.
 */
function standCellLabel(reservation: FullReservation): string {
  const summary = summarizeReservationStands(
    reservation.members.map((member) => ({
      id: member.standId,
      label: member.stand.label,
      standNumber: member.stand.standNumber,
      standCategory: member.stand.standCategory,
      releasedAt: member.releasedAt,
      position: member.position,
    })),
  );
  return summary.label || formatStandLabel(reservation.stand);
}

export const columns = (
  canMutate = false,
): ColumnDef<FullReservationWithTender>[] => [
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
    accessorFn: (row) => standCellLabel(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.stand} />
    ),
    cell: ({ row }) => {
      const reservation = row.original;
      const hidden = isReservationHidden(reservation);
      return (
        <div className="flex items-center gap-1.5">
          <span>{standCellLabel(reservation)}</span>
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
    id: "coverage",
    accessorFn: (row) => reservationCoverageState(row) ?? "",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.coverage} />
    ),
    cell: ({ row }) => {
      const state = reservationCoverageState(row.original);
      if (!state || !row.original.tender) return "--";
      return (
        <CoverageCell
          state={state}
          tender={row.original.tender}
          dueAt={row.original.invoices[0]?.dueAt}
        />
      );
    },
    filterFn: (row, columnId, filter) => {
      if (!filter || filter.length === 0) return true;
      const status = row.getValue(columnId);
      return filter.includes(status);
    },
  },
  {
    id: "owner",
    accessorFn: (row) => invoiceOwnerName(row) ?? "",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.owner} />
    ),
    cell: ({ row }) => invoiceOwnerName(row.original) ?? "--",
  },
  {
    id: "totalAmount",
    accessorFn: (row) => row.tender?.totalAmount ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.totalAmount} />
    ),
    cell: ({ row }) => money(row.original.tender?.totalAmount),
  },
  {
    id: "creditAmount",
    accessorFn: (row) => row.tender?.confirmedCreditAmount ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.creditAmount}
      />
    ),
    cell: ({ row }) =>
      (row.original.tender?.confirmedCreditAmount ?? 0) > 0
        ? money(row.original.tender!.confirmedCreditAmount)
        : "--",
  },
  {
    id: "cashAmount",
    accessorFn: (row) => row.tender?.approvedCashAmount ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.cashAmount} />
    ),
    cell: ({ row }) =>
      (row.original.tender?.approvedCashAmount ?? 0) > 0
        ? money(row.original.tender!.approvedCashAmount)
        : "--",
  },
  {
    id: "outstandingAmount",
    accessorFn: (row) => row.tender?.outstandingAmount ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.outstandingAmount}
      />
    ),
    cell: ({ row }) => money(row.original.tender?.outstandingAmount),
  },
  {
    id: "proof",
    header: columnTitles.proof,
    cell: ({ row }) => {
      const invoice = row.original.invoices[0];
      if (!invoice) return "--";
      return (
        <ViewPaymentProofCell
          invoice={{ ...invoice, reservation: row.original }}
        />
      );
    },
  },
  {
    id: "reviewAge",
    // How long this row has been waiting on a decision — the settlement
    // lens's real sort key.
    accessorFn: (row) => reviewWaitingSince(row)?.getTime() ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.reviewAge} />
    ),
    cell: ({ row }) => {
      const since = reviewWaitingSince(row.original);
      return since ? formatDateWithTime(since) : "--";
    },
  },
  {
    id: "dueAt",
    accessorFn: (row) => row.invoices[0]?.dueAt?.getTime() ?? 0,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.dueAt} />
    ),
    cell: ({ row }) => {
      const dueAt = row.original.invoices[0]?.dueAt;
      return dueAt ? formatDateWithTime(dueAt) : "--";
    },
  },
  {
    id: "features",
    accessorFn: (row) => featureSummary(row),
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.features} />
    ),
    cell: ({ row }) => featureSummary(row.original) || "--",
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
    cell: ({ row }) => (
      <ConsoleActionsCell reservation={row.original} canMutate={canMutate} />
    ),
  },
];
