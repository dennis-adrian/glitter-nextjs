"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DateTime } from "luxon";
import Link from "next/link";

import CreditPurchaseReviewButton from "@/app/components/credits/admin/credit-purchase-review-button";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import { DataTableDateRangeFilter } from "@/app/components/ui/data_table/date-range-filter";
import {
  CREDIT_FEATURE_TYPE_LABELS,
  CREDIT_TOP_UP_PURPOSE_LABELS,
  CREDIT_TOP_UP_PURPOSES,
  CREDIT_TOP_UP_STATUS_LABELS,
  type CreditPurchaseStatusFilter,
} from "@/app/lib/credits/admin-definitions";
import type { CreditPurchaseRow } from "@/app/lib/credits/admin-queries";
import { formatDateWithTime, STORE_TIMEZONE } from "@/app/lib/formatters";
import { consoleHref } from "@/app/lib/reservations/console-lenses";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  under_review: "amber",
  approved: "green",
  rejected: "red",
  expired: "secondary",
  awaiting_voucher: "outline",
};

const linkClass = "text-primary underline-offset-2 hover:underline";

/**
 * How long ago `date` was, measured against the server's clock at render.
 *
 * Measuring against the browser's own clock would render different text on
 * the server and during hydration (seconds apart, "hace 59 segundos" becomes
 * "hace 1 minuto"), and React would throw the server's markup away.
 */
function relative(date: Date, now: Date) {
  return DateTime.fromJSDate(date, { zone: STORE_TIMEZONE })
    .setLocale("es")
    .toRelative({ base: DateTime.fromJSDate(now, { zone: STORE_TIMEZONE }) });
}

function arrivedAt(row: CreditPurchaseRow) {
  return row.submittedAt ?? row.createdAt;
}

/**
 * What the purchase was for, and a way to it.
 *
 * An invoice purchase links to its reservation's cobro in the festival
 * console, focused on that one row: the festival-wide cobros queue could be
 * filtered to exclude it, and that lens is where the reservation's tender —
 * credits applied, cash, what is still owed — lives.
 */
function Purpose({ row }: { row: CreditPurchaseRow }) {
  const feature =
    row.intendedUseType === "feature" && row.featureType
      ? CREDIT_FEATURE_TYPE_LABELS[row.featureType]
      : null;
  return (
    <div className="min-w-60 space-y-0.5">
      <p>
        {CREDIT_TOP_UP_PURPOSE_LABELS[row.intendedUseType]}
        {feature && <span className="text-muted-foreground"> · {feature}</span>}
      </p>
      {row.festival && (
        <p className="text-xs text-muted-foreground">{row.festival.name}</p>
      )}
      {row.invoice && row.festival && (
        <Link
          href={consoleHref({
            festivalId: row.festival.id,
            lens: "cobros",
            reservationId: row.invoice.reservationId,
          })}
          className={cn("text-xs", linkClass)}
        >
          Ver los pagos de la reserva #{row.invoice.reservationId}
        </Link>
      )}
    </div>
  );
}

/**
 * The column an admin reads before deciding, or the decision once made.
 *
 * For a pending voucher that is what rejecting it would cost: credits already
 * spent are gone, and a rejection leaves the account in debt for them. That
 * used to be visible only inside the review dialog.
 */
function Decision({ row }: { row: CreditPurchaseRow }) {
  if (row.review) {
    const spent = row.review.spentSinceSubmission;
    const after = row.review.balanceAfterReversal;
    return (
      <div className="min-w-44 space-y-0.5 text-xs">
        <p
          className={cn(spent > 0 ? "text-amber-700" : "text-muted-foreground")}
        >
          {spent > 0 ? (
            <>
              Ya usó <CreditAmount amount={spent} className="font-medium" />{" "}
              desde el envío
            </>
          ) : (
            "No usó créditos desde el envío"
          )}
        </p>
        <p className={cn(after < 0 ? "text-red-600" : "text-muted-foreground")}>
          Si se rechaza, queda en{" "}
          <CreditAmount amount={after} className="font-medium" />
        </p>
      </div>
    );
  }
  if (row.status === "awaiting_voucher") {
    return (
      <p className="min-w-44 text-xs text-muted-foreground">
        Tiene hasta {formatDateWithTime(row.uploadDeadlineAt)} para subir el
        comprobante
      </p>
    );
  }
  if (row.status === "expired") {
    return (
      <p className="min-w-44 text-xs text-muted-foreground">
        Venció sin comprobante; no emitió créditos
      </p>
    );
  }
  return (
    <div className="min-w-44 space-y-0.5 text-xs text-muted-foreground">
      {row.reviewedAt && (
        <p>
          {formatDateWithTime(row.reviewedAt)}
          {row.reviewerName && ` · ${row.reviewerName}`}
        </p>
      )}
      {row.rejectionReason && (
        <p className="text-foreground">Motivo: {row.rejectionReason}</p>
      )}
    </div>
  );
}

function PurchaseCell({
  row,
  showStatus,
  now,
}: {
  row: CreditPurchaseRow;
  showStatus: boolean;
  now: Date;
}) {
  return (
    <div className="space-y-0.5 whitespace-nowrap">
      <div className="flex items-center gap-2 font-medium">
        #{row.id}
        {showStatus && (
          <Badge size="sm" variant={STATUS_VARIANTS[row.status] ?? "outline"}>
            {CREDIT_TOP_UP_STATUS_LABELS[row.status] ?? row.status}
          </Badge>
        )}
      </div>
      {row.status === "under_review" && (
        <p className="text-xs text-muted-foreground">
          Espera{" "}
          {relative(arrivedAt(row), now)?.replace(/^hace /, "desde hace ")}
        </p>
      )}
    </div>
  );
}

const columnTitles: Record<string, string> = {
  purchase: "Compra",
  participant: "Participante",
  purpose: "Destino",
  amount: "Monto",
  arrivedAt: "Llegó",
  decision: "Revisión",
};

function hasAction(row: CreditPurchaseRow) {
  return row.review != null || row.voucherUrl != null;
}

function buildColumns({
  status,
  canReview,
  showUser,
  showActions,
  now,
}: {
  status: CreditPurchaseStatusFilter;
  canReview: boolean;
  showUser: boolean;
  showActions: boolean;
  now: Date;
}): ColumnDef<CreditPurchaseRow>[] {
  const pending = status === "under_review";
  const columns: ColumnDef<CreditPurchaseRow>[] = [
    {
      id: "purchase",
      accessorFn: (row) => row.id,
      header: () => columnTitles.purchase,
      cell: ({ row }) => (
        <PurchaseCell
          row={row.original}
          showStatus={status === "all"}
          now={now}
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "participant",
      accessorFn: (row) => getUserName(row.user) || row.user.email,
      header: () => columnTitles.participant,
      cell: ({ row }) => (
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
      enableHiding: false,
    },
    {
      id: "purpose",
      accessorFn: (row) => row.intendedUseType,
      header: () => columnTitles.purpose,
      cell: ({ row }) => <Purpose row={row.original} />,
      enableSorting: false,
    },
    {
      id: "amount",
      accessorFn: (row) => row.amount,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={columnTitles.amount!} />
      ),
      cell: ({ row }) => (
        <CreditAmount amount={row.original.amount} className="font-medium" />
      ),
      sortDescFirst: true,
      meta: { align: "right" },
    },
    {
      id: "arrivedAt",
      accessorFn: (row) => arrivedAt(row),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.arrivedAt!}
        />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateWithTime(arrivedAt(row.original))}
        </span>
      ),
      sortDescFirst: !pending,
    },
    {
      id: "decision",
      accessorFn: (row) => row.reviewedAt,
      header: () => (pending ? "Si se rechaza" : columnTitles.decision),
      cell: ({ row }) => <Decision row={row.original} />,
      enableSorting: false,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) =>
        row.original.review ? (
          <CreditPurchaseReviewButton
            purchase={row.original}
            review={row.original.review}
            canReview={canReview}
          />
        ) : row.original.voucherUrl ? (
          <a
            href={row.original.voucherUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("whitespace-nowrap text-sm", linkClass)}
          >
            Comprobante
          </a>
        ) : null,
      enableSorting: false,
      enableHiding: false,
    },
  ];
  return columns.filter(
    (column) =>
      (showUser || column.id !== "participant") &&
      (showActions || column.id !== "actions"),
  );
}

export default function CreditPurchasesDataTable({
  rows,
  rowCount,
  totalAmount,
  status,
  festivals,
  canReview,
  now,
  showUser = true,
}: {
  rows: CreditPurchaseRow[];
  rowCount: number;
  totalAmount: number;
  status: CreditPurchaseStatusFilter;
  festivals: { id: number; name: string }[];
  canReview: boolean;
  /** When the page was rendered; waiting times are counted up to it. */
  now: Date;
  /** Off on a single account's page, where every row is the same person. */
  showUser?: boolean;
}) {
  return (
    <DataTable
      // A new status tab is a different list, with its own default order.
      key={status}
      columns={buildColumns({
        status,
        canReview,
        showUser,
        // A tab of purchases still waiting on a voucher, or expired without
        // one, has nothing to open; the column would be an empty strip.
        showActions: rows.some(hasAction),
        now,
      })}
      data={rows}
      columnTitles={columnTitles}
      getRowId={(row) => String(row.id)}
      server={{
        rowCount,
        defaultSorting: {
          id: "arrivedAt",
          desc: status !== "under_review",
        },
      }}
      searchPlaceholder={
        showUser
          ? "Buscar por participante, correo o #compra"
          : "Buscar #compra"
      }
      filters={[
        {
          columnId: "purpose",
          label: "Destino",
          multiple: false,
          options: CREDIT_TOP_UP_PURPOSES.map((value) => ({
            value,
            label: CREDIT_TOP_UP_PURPOSE_LABELS[value]!,
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
          <DataTableDateRangeFilter label="Llegó" />
          <span className="text-sm text-muted-foreground">
            Total{" "}
            <CreditAmount
              amount={totalAmount}
              className="font-medium text-foreground"
            />
          </span>
        </>
      }
      renderMobileRow={(row) => (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <PurchaseCell row={row} showStatus={status === "all"} now={now} />
              <p className="truncate">
                {getUserName(row.user) || row.user.email}
              </p>
            </div>
            <CreditAmount
              amount={row.amount}
              className="shrink-0 font-semibold"
            />
          </div>
          <Purpose row={row} />
          <Decision row={row} />
          {row.review && (
            <CreditPurchaseReviewButton
              purchase={row}
              review={row.review}
              canReview={canReview}
            />
          )}
        </div>
      )}
      emptyMessage={
        status === "under_review"
          ? "No hay comprobantes esperando revisión."
          : "Ninguna compra coincide con el filtro."
      }
    />
  );
}
