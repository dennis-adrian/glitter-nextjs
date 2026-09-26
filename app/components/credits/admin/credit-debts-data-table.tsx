"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import CreditDebtResolveButton from "@/app/components/credits/admin/credit-debt-resolve-button";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge } from "@/app/components/ui/badge";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import type { CreditDebtAccount } from "@/app/lib/credits/queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";

const columnTitles: Record<string, string> = {
  participant: "Participante",
  ledgerBalance: "Saldo",
  debtAmount: "Debe",
  cachedBalance: "Saldo en caché",
  lastReversalAt: "Última reversión",
};

function participantName(row: CreditDebtAccount) {
  return getUserName(row.user) || row.user.email;
}

/**
 * Accounts needing an admin: a negative balance from a reversed top-up, or a
 * cached projection that disagrees with the ledger.
 *
 * A negative balance blocks its participant from every credit operation, so
 * this is a work queue rather than a report — every row with a debt carries
 * the action that clears it.
 */
export default function CreditDebtsDataTable({
  accounts,
  canResolve,
}: {
  accounts: CreditDebtAccount[];
  canResolve: boolean;
}) {
  const columns: ColumnDef<CreditDebtAccount>[] = [
    {
      id: "participant",
      accessorFn: participantName,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.participant!}
        />
      ),
      cell: ({ row }) => (
        <div className="min-w-48 max-w-72">
          <Link
            href={`/dashboard/credits/accounts/${row.original.user.id}`}
            className="block truncate font-medium hover:underline"
          >
            {participantName(row.original)}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {row.original.user.email}
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {row.original.debtAmount > 0 && <Badge variant="red">Debe</Badge>}
            {row.original.hasDrift && <Badge variant="amber">Descuadre</Badge>}
          </div>
        </div>
      ),
      enableHiding: false,
    },
    {
      id: "debtAmount",
      accessorFn: (row) => row.debtAmount,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.debtAmount!}
        />
      ),
      cell: ({ row }) =>
        row.original.debtAmount > 0 ? (
          <CreditAmount
            amount={row.original.debtAmount}
            className="font-medium text-red-600"
          />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortDescFirst: true,
      meta: { align: "right" },
    },
    {
      id: "ledgerBalance",
      accessorFn: (row) => row.ledgerBalance,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.ledgerBalance!}
        />
      ),
      cell: ({ row }) => <CreditAmount amount={row.original.ledgerBalance} />,
      meta: { align: "right" },
    },
    {
      id: "cachedBalance",
      accessorFn: (row) => row.cachedBalance,
      header: () => columnTitles.cachedBalance,
      cell: ({ row }) =>
        row.original.hasDrift ? (
          <span title="No coincide con el libro; el libro manda.">
            <CreditAmount
              amount={row.original.cachedBalance}
              className="text-amber-700"
            />
          </span>
        ) : (
          <span className="text-muted-foreground">Coincide</span>
        ),
      enableSorting: false,
      meta: { align: "right" },
    },
    {
      id: "lastReversalAt",
      accessorFn: (row) => row.lastReversalAt,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.lastReversalAt!}
        />
      ),
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.original.lastReversalAt
            ? formatDateWithTime(row.original.lastReversalAt)
            : "—"}
        </span>
      ),
      sortDescFirst: true,
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) =>
        row.original.debtAmount > 0 ? (
          <CreditDebtResolveButton
            userId={row.original.user.id}
            participantName={participantName(row.original)}
            debtAmount={row.original.debtAmount}
            canResolve={canResolve}
          />
        ) : (
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            Solo revisar el descuadre
          </span>
        ),
      enableSorting: false,
      enableHiding: false,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={accounts}
      columnTitles={columnTitles}
      getRowId={(row) => String(row.user.id)}
      searchPlaceholder="Buscar por nombre o correo"
      renderMobileRow={(row) => (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                href={`/dashboard/credits/accounts/${row.user.id}`}
                className="block truncate font-medium"
              >
                {participantName(row)}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {row.user.email}
              </p>
            </div>
            <CreditAmount
              amount={row.ledgerBalance}
              className={
                row.debtAmount > 0
                  ? "shrink-0 font-semibold text-red-600"
                  : "shrink-0 font-semibold"
              }
            />
          </div>
          {row.hasDrift && (
            <p className="text-xs text-amber-700">
              El saldo en caché no coincide con el libro.
            </p>
          )}
          {row.debtAmount > 0 && (
            <CreditDebtResolveButton
              userId={row.user.id}
              participantName={participantName(row)}
              debtAmount={row.debtAmount}
              canResolve={canResolve}
            />
          )}
        </div>
      )}
      emptyMessage="Ninguna cuenta tiene saldo pendiente ni descuadre."
    />
  );
}
