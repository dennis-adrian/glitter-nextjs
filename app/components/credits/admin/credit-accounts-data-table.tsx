"use client";

import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";

import CreditAccountPicker from "@/app/components/credits/admin/credit-account-picker";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge } from "@/app/components/ui/badge";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
  CREDIT_ACCOUNT_FILTER_LABELS,
  CREDIT_ACCOUNT_FILTERS,
  DEFAULT_CREDIT_ACCOUNT_FILTERS,
} from "@/app/lib/credits/admin-definitions";
import type { CreditAccountRow } from "@/app/lib/credits/admin-queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

function accountHref(row: CreditAccountRow) {
  return `/dashboard/credits/accounts/${row.user.id}`;
}

function Amount({ amount, className }: { amount: number; className?: string }) {
  return (
    <CreditAmount
      amount={amount}
      className={cn(
        amount < 0 && "text-red-600",
        amount === 0 && "text-muted-foreground",
        className,
      )}
    />
  );
}

function StatusBadges({ row }: { row: CreditAccountRow }) {
  return (
    <>
      {row.balances.ledgerBalance < 0 && <Badge variant="red">Debe</Badge>}
      {row.hasDrift && <Badge variant="amber">Descuadre</Badge>}
      {row.underReviewCount > 0 && (
        <Badge variant="amber">
          {row.underReviewCount === 1
            ? "1 en revisión"
            : `${row.underReviewCount} en revisión`}
        </Badge>
      )}
    </>
  );
}

const columnTitles: Record<string, string> = {
  name: "Participante",
  balance: "Saldo",
  holds: "Retenido",
  spendable: "Disponible",
  purchased: "Comprado",
  spent: "Usado",
  adjustments: "Ajustes",
  lastActivity: "Último movimiento",
};

// Ids are the server's sort keys, so a header click is the sort it asks for.
const columns: ColumnDef<CreditAccountRow>[] = [
  {
    id: "name",
    accessorFn: (row) => getUserName(row.user) || row.user.email,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.name!} />
    ),
    cell: ({ row }) => (
      <div className="min-w-48 max-w-72">
        <Link
          href={accountHref(row.original)}
          className="block truncate font-medium hover:underline"
        >
          {getUserName(row.original.user) || row.original.user.email}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {row.original.user.email}
        </span>
        <div className="mt-1 flex flex-wrap gap-1 empty:hidden">
          <StatusBadges row={row.original} />
        </div>
      </div>
    ),
    enableHiding: false,
  },
  {
    id: "balance",
    accessorFn: (row) => row.balances.ledgerBalance,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.balance!} />
    ),
    cell: ({ row }) => (
      <Amount
        amount={row.original.balances.ledgerBalance}
        className="font-medium"
      />
    ),
    sortDescFirst: true,
    meta: { align: "right" },
  },
  {
    id: "holds",
    accessorFn: (row) => row.balances.activeHolds,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.holds!} />
    ),
    cell: ({ row }) => <Amount amount={row.original.balances.activeHolds} />,
    enableSorting: false,
    meta: { align: "right" },
  },
  {
    id: "spendable",
    accessorFn: (row) => row.balances.spendableBalance,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.spendable!} />
    ),
    cell: ({ row }) => (
      <Amount amount={row.original.balances.spendableBalance} />
    ),
    sortDescFirst: true,
    meta: { align: "right" },
  },
  {
    id: "purchased",
    accessorFn: (row) => row.purchased,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.purchased!} />
    ),
    cell: ({ row }) => <Amount amount={row.original.purchased} />,
    sortDescFirst: true,
    meta: { align: "right" },
  },
  {
    id: "spent",
    accessorFn: (row) => row.spent,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={columnTitles.spent!} />
    ),
    cell: ({ row }) => <Amount amount={row.original.spent} />,
    sortDescFirst: true,
    meta: { align: "right" },
  },
  {
    id: "adjustments",
    accessorFn: (row) => row.adminNet,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.adjustments!}
      />
    ),
    cell: ({ row }) => (
      <CreditAmount
        amount={row.original.adminNet}
        signed
        className={cn(row.original.adminNet === 0 && "text-muted-foreground")}
      />
    ),
    enableSorting: false,
    meta: { align: "right" },
  },
  {
    id: "lastActivity",
    accessorFn: (row) => row.lastActivityAt,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        title={columnTitles.lastActivity!}
      />
    ),
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-muted-foreground">
        {row.original.lastActivityAt
          ? formatDateWithTime(row.original.lastActivityAt)
          : "—"}
      </span>
    ),
    sortDescFirst: true,
  },
];

function MobileRow(row: CreditAccountRow) {
  return (
    <Link
      href={accountHref(row)}
      className="block space-y-1.5 rounded-md border bg-background p-3 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {getUserName(row.user) || row.user.email}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {row.user.email}
          </p>
        </div>
        <Amount
          amount={row.balances.ledgerBalance}
          className="shrink-0 font-semibold"
        />
      </div>
      <div className="flex flex-wrap gap-1 empty:hidden">
        <StatusBadges row={row} />
      </div>
      <p className="text-xs text-muted-foreground">
        Disponible <Amount amount={row.balances.spendableBalance} /> · comprado{" "}
        <Amount amount={row.purchased} /> · usado <Amount amount={row.spent} />
      </p>
    </Link>
  );
}

export default function CreditAccountsDataTable({
  rows,
  rowCount,
  balanceTotal,
}: {
  rows: CreditAccountRow[];
  rowCount: number;
  balanceTotal: number;
}) {
  return (
    <DataTable
      columns={columns}
      data={rows}
      columnTitles={columnTitles}
      getRowId={(row) => String(row.user.id)}
      server={{
        rowCount,
        defaultSorting: { id: "balance", desc: true },
      }}
      searchPlaceholder="Buscar por nombre, correo o #id"
      filters={[
        {
          columnId: "filter",
          label: "Estado",
          // An account in any of the chosen states; see the search params.
          options: CREDIT_ACCOUNT_FILTERS.map((value) => ({
            value,
            label: CREDIT_ACCOUNT_FILTER_LABELS[value],
          })),
          defaultValue: DEFAULT_CREDIT_ACCOUNT_FILTERS,
        },
      ]}
      toolbar={
        <span className="text-sm text-muted-foreground">
          Saldo total{" "}
          <Amount
            amount={balanceTotal}
            className="font-medium text-foreground"
          />
        </span>
      }
      actions={<CreditAccountPicker />}
      renderMobileRow={MobileRow}
      emptyMessage="Ninguna cuenta coincide con la búsqueda."
    />
  );
}
