"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import CreditAmount from "@/app/components/credits/credit-amount";
import ReleaseFeatureCreditsButton from "@/app/components/credits/release-feature-credits-button";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import type { FeatureHold } from "@/app/lib/credits/queries";
import { formatDateWithTime } from "@/app/lib/formatters";

const STATUS: Record<
  FeatureHold["status"],
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Retenido", variant: "amber" },
  captured: { label: "Cobrado", variant: "green" },
  released: { label: "Liberado", variant: "outline" },
  expired: { label: "Vencido", variant: "outline" },
};

const columnTitles: Record<string, string> = {
  festival: "Festival",
  status: "Estado",
  amount: "Monto",
  reservedAt: "Activada",
  closedAt: "Cerrada",
};

/**
 * Every full-table earmark, open or closed. Holds move the spendable balance
 * without a ledger entry, so without them the history cannot explain a dip.
 *
 * Releasing is offered here because an activation only the participant could
 * undo is unreachable once they stop coming back — and the one whose voucher
 * was rejected has the least reason to. Releasing posts no entry either way;
 * it drops the earmark, which frees only credit that is still there.
 */
export default function CreditHoldsDataTable({
  userId,
  holds,
  unbackedAmount,
  canRelease,
}: {
  userId: number;
  holds: FeatureHold[];
  /** Held credit no longer backed by the ledger; see `unbackedHoldAmount`. */
  unbackedAmount: number;
  canRelease: boolean;
}) {
  const columns: ColumnDef<FeatureHold>[] = [
    {
      id: "festival",
      accessorFn: (row) => row.festivalName,
      header: () => columnTitles.festival,
      cell: ({ row }) => (
        <div>
          <p className="font-medium">Mesa completa</p>
          <Link
            href={`/dashboard/festivals/${row.original.festivalId}`}
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {row.original.festivalName}
          </Link>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      header: () => columnTitles.status,
      cell: ({ row }) => (
        <Badge size="sm" variant={STATUS[row.original.status].variant}>
          {STATUS[row.original.status].label}
        </Badge>
      ),
    },
    {
      id: "amount",
      accessorFn: (row) => row.amount,
      header: () => columnTitles.amount,
      cell: ({ row }) => (
        <CreditAmount amount={row.original.amount} className="font-medium" />
      ),
      meta: { align: "right" },
    },
    {
      id: "reservedAt",
      accessorFn: (row) => row.reservedAt,
      header: () => columnTitles.reservedAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateWithTime(row.original.reservedAt)}
        </span>
      ),
    },
    {
      id: "closedAt",
      accessorFn: (row) => row.closedAt,
      header: () => columnTitles.closedAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.closedAt
            ? formatDateWithTime(row.original.closedAt)
            : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) =>
        row.original.status === "active" ? (
          <ReleaseFeatureCreditsButton
            userId={userId}
            festivalId={row.original.festivalId}
            label={
              unbackedAmount > 0
                ? "Liberar la mesa completa"
                : `Liberar ${formatCreditCount(row.original.amount)}`
            }
            disabledReason={
              canRelease
                ? undefined
                : "Solo un administrador general puede liberarla"
            }
          />
        ) : null,
      enableSorting: false,
      enableHiding: false,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Releasing a backed hold gives the credits back; releasing one whose
          credits were reversed closes the earmark and returns nothing, so the
          two cannot share copy. */}
      {unbackedAmount > 0 && (
        <p className="shrink-0 rounded-md bg-amber-50 p-3 text-xs text-amber-900">
          Tiene la mesa completa activada con créditos que después se
          revirtieron. Liberarla cierra la reserva, pero no devuelve{" "}
          {formatCreditCount(unbackedAmount)} a su saldo: esos créditos ya no
          están.
        </p>
      )}
      <DataTable
        // Only an active hold can be released; with none, the column would be
        // an empty strip down the table's edge.
        columns={
          holds.some((hold) => hold.status === "active")
            ? columns
            : columns.filter((column) => column.id !== "actions")
        }
        data={holds}
        columnTitles={columnTitles}
        getRowId={(row) => String(row.featureActionId)}
        searchable={false}
        density="compact"
        emptyMessage="Nunca activó una función con créditos retenidos."
      />
    </div>
  );
}
