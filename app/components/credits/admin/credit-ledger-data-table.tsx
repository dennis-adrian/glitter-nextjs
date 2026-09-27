"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import CreditRevertButton from "@/app/components/credits/admin/credit-revert-button";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { DataTableDateRangeFilter } from "@/app/components/ui/data_table/date-range-filter";
import {
  canRevertCreditEntry,
  CREDIT_DEBT_RESOLUTION_LABELS,
  CREDIT_LEDGER_KIND_LABELS,
  CREDIT_LEDGER_KINDS,
  CREDIT_TOP_UP_STATUS_LABELS,
} from "@/app/lib/credits/admin-definitions";
import type { CreditLedgerRow } from "@/app/lib/credits/admin-queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { featureActionLabel } from "@/app/lib/payments/feature-credits";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

const TOP_UP_STATUS_VARIANTS: Record<string, BadgeVariant> = {
  under_review: "amber",
  approved: "green",
  rejected: "red",
  expired: "secondary",
  awaiting_voucher: "amber",
};

const linkClass = "text-primary underline-offset-2 hover:underline";

function ReservationLink({ id }: { id: number }) {
  return (
    <Link href={`/dashboard/reservations/${id}/edit`} className={linkClass}>
      reserva #{id}
    </Link>
  );
}

/** What the entry was for, in the terms of whatever it touched. */
function EntryContext({ row }: { row: CreditLedgerRow }) {
  const parts: React.ReactNode[] = [];

  if (row.topUp) {
    parts.push(
      <span key="top-up" className="inline-flex flex-wrap items-center gap-1">
        Compra #{row.topUp.id}
        <Badge
          size="sm"
          variant={TOP_UP_STATUS_VARIANTS[row.topUp.status] ?? "secondary"}
        >
          {CREDIT_TOP_UP_STATUS_LABELS[row.topUp.status] ?? row.topUp.status}
        </Badge>
        {row.topUp.voucherUrl && (
          <a
            href={row.topUp.voucherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            ver comprobante
          </a>
        )}
      </span>,
    );
  }
  if (row.invoice) {
    parts.push(
      <span key="invoice">
        {row.kind === "refund" ? "Devuelto del cobro" : "Cobro"} #
        {row.invoice.id} · <ReservationLink id={row.invoice.reservationId} />
      </span>,
    );
  }
  if (row.featureAction) {
    parts.push(
      <span key="feature">
        {featureActionLabel(row.featureAction.type)}
        {row.featureAction.reservationId != null && (
          <>
            {" "}
            · <ReservationLink id={row.featureAction.reservationId} />
          </>
        )}
      </span>,
    );
  }
  if (row.standChangeReservationId != null) {
    parts.push(
      <span key="stand-change">
        Cambio de espacio ·{" "}
        <ReservationLink id={row.standChangeReservationId} />
      </span>,
    );
  }
  if (row.festival) {
    parts.push(
      <Link
        key="festival"
        href={`/dashboard/festivals/${row.festival.id}`}
        className={linkClass}
      >
        {row.festival.name}
      </Link>,
    );
  }
  if (row.resolution) {
    parts.push(
      <span key="resolution">
        {CREDIT_DEBT_RESOLUTION_LABELS[row.resolution] ?? row.resolution}
      </span>,
    );
  }
  // An undo posted from this screen already says so in its reason; the link
  // is only worth spelling out for one that arrived without one.
  if (row.kind === "revert" && row.reversesEntryId != null && !row.reason) {
    parts.push(
      <span key="reverts">Revierte el movimiento #{row.reversesEntryId}</span>,
    );
  }

  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">·</span>}
          {part}
        </span>
      ))}
    </div>
  );
}

function revertedLabel(row: CreditLedgerRow) {
  if (!row.isReverted) return null;
  // A spend is undone by handing its credits back; anything else by an
  // admin's opposite entry.
  return row.kind === "spend" ? "Devuelto" : "Revertido";
}

function Movement({ row }: { row: CreditLedgerRow }) {
  const reverted = revertedLabel(row);
  return (
    <div className="min-w-64 space-y-0.5">
      <div className="flex flex-wrap items-center gap-2 font-medium">
        {CREDIT_LEDGER_KIND_LABELS[row.kind]}
        {reverted && (
          <Badge size="sm" variant="outline">
            {reverted}
          </Badge>
        )}
      </div>
      {row.reason && <p className="text-muted-foreground">{row.reason}</p>}
      <EntryContext row={row} />
      {row.actor && (
        <p className="text-xs text-muted-foreground">Por {row.actor.name}</p>
      )}
    </div>
  );
}

function Amount({ amount }: { amount: number }) {
  return (
    <CreditAmount
      amount={amount}
      signed
      className={cn("font-medium", amount > 0 && "text-green-700")}
    />
  );
}

const columnTitles: Record<string, string> = {
  date: "Fecha",
  participant: "Participante",
  movement: "Movimiento",
  amount: "Monto",
};

function buildColumns({
  showUser,
  showActions,
}: {
  showUser: boolean;
  showActions: boolean;
}): ColumnDef<CreditLedgerRow>[] {
  return [
    {
      id: "date",
      accessorFn: (row) => row.createdAt,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.date!} />
      ),
      cell: ({ row }) => (
        <div className="whitespace-nowrap text-muted-foreground">
          <p>{formatDateWithTime(row.original.createdAt)}</p>
          <p className="text-xs">#{row.original.id}</p>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    ...(showUser
      ? [
          {
            id: "participant",
            accessorFn: (row: CreditLedgerRow) =>
              getUserName(row.user) || row.user.email,
            header: () => columnTitles.participant,
            cell: ({ row }: { row: { original: CreditLedgerRow } }) => (
              <div className="min-w-40 max-w-60">
                <Link
                  href={`/dashboard/credits/accounts/${row.original.user.id}`}
                  className="block truncate hover:underline"
                >
                  {getUserName(row.original.user) || row.original.user.email}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.original.user.email}
                </span>
              </div>
            ),
            enableSorting: false,
          } satisfies ColumnDef<CreditLedgerRow>,
        ]
      : []),
    {
      id: "movement",
      accessorFn: (row) => CREDIT_LEDGER_KIND_LABELS[row.kind],
      header: () => columnTitles.movement,
      cell: ({ row }) => <Movement row={row.original} />,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "amount",
      accessorFn: (row) => row.amount,
      header: () => columnTitles.amount,
      cell: ({ row }) => <Amount amount={row.original.amount} />,
      enableSorting: false,
      enableHiding: false,
      meta: { align: "right" },
    },
    ...(showActions
      ? [
          {
            id: "actions",
            header: () => <span className="sr-only">Acciones</span>,
            cell: ({ row }: { row: { original: CreditLedgerRow } }) =>
              canRevertCreditEntry(row.original) ? (
                <CreditRevertButton
                  userId={row.original.user.id}
                  entryId={row.original.id}
                  amount={row.original.amount}
                />
              ) : null,
            enableSorting: false,
            enableHiding: false,
          } satisfies ColumnDef<CreditLedgerRow>,
        ]
      : []),
  ];
}

export type CreditLedgerTotals = {
  creditsIn: number;
  creditsOut: number;
};

export default function CreditLedgerDataTable({
  rows,
  rowCount,
  totals,
  festivals,
  canAdjust,
  showUser = true,
}: {
  rows: CreditLedgerRow[];
  rowCount: number;
  totals: CreditLedgerTotals;
  festivals: { id: number; name: string }[];
  canAdjust: boolean;
  /** Off on a single account's page, where every row is the same person. */
  showUser?: boolean;
}) {
  return (
    <DataTable
      columns={buildColumns({
        showUser,
        // Most entries cannot be undone, so on a page with none the column
        // would be an empty strip down the table's edge.
        showActions: canAdjust && rows.some(canRevertCreditEntry),
      })}
      data={rows}
      columnTitles={columnTitles}
      getRowId={(row) => String(row.id)}
      density="compact"
      server={{ rowCount }}
      // Search finds participants; on one account there is nobody else.
      searchable={showUser}
      searchPlaceholder="Buscar participante por nombre, correo o #id"
      filters={[
        {
          columnId: "kind",
          label: "Tipo",
          options: CREDIT_LEDGER_KINDS.map((value) => ({
            value,
            label: CREDIT_LEDGER_KIND_LABELS[value],
          })),
        },
        {
          columnId: "festivalId",
          label: "Festival",
          multiple: false,
          options: festivals.map((festival) => ({
            value: String(festival.id),
            label: festival.name,
          })),
        },
      ]}
      toolbar={
        <>
          <DataTableDateRangeFilter />
          <span className="text-sm text-muted-foreground">
            Entradas{" "}
            <CreditAmount
              amount={totals.creditsIn}
              signed
              className="font-medium text-green-700"
            />{" "}
            · salidas{" "}
            <CreditAmount
              amount={totals.creditsOut}
              className="font-medium text-foreground"
            />
          </span>
        </>
      }
      renderMobileRow={(row) => (
        <div className="space-y-1 rounded-md border bg-background p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <Movement row={row} />
            <span className="shrink-0">
              <Amount amount={row.amount} />
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatDateWithTime(row.createdAt)} · #{row.id}
            {showUser && ` · ${getUserName(row.user) || row.user.email}`}
          </p>
          {canAdjust && canRevertCreditEntry(row) && (
            <CreditRevertButton
              userId={row.user.id}
              entryId={row.id}
              amount={row.amount}
            />
          )}
        </div>
      )}
      emptyMessage="Ningún movimiento coincide con el filtro."
    />
  );
}
