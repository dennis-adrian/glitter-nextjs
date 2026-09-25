import { PackageOpenIcon } from "lucide-react";
import Link from "next/link";

import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge } from "@/app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import {
  CREDIT_ADMIN_PAGE_SIZES,
  type CreditAccountsSearchParams,
} from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditAccounts,
  type CreditAccountRow,
} from "@/app/lib/credits/admin-queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { getUserName } from "@/app/lib/users/utils";
import { cn } from "@/lib/utils";

function accountHref(row: CreditAccountRow) {
  return `/dashboard/credits/accounts/${row.user.id}`;
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

function Balance({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  return (
    <CreditAmount
      amount={amount}
      className={cn(
        "tabular-nums",
        amount < 0 && "text-red-600",
        amount === 0 && "text-muted-foreground",
        className,
      )}
    />
  );
}

export default async function CreditAccountsTable({
  params,
}: {
  params: CreditAccountsSearchParams;
}) {
  const page = await fetchCreditAccounts(params);
  if (!page) return null;

  const { rows, total, balanceTotal } = page;
  const pageCount = Math.ceil(total / params.limit);
  const pageIndex = Math.floor(params.offset / params.limit) + 1;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <PackageOpenIcon className="h-12 w-12" />
        <span className="text-sm">Ninguna cuenta coincide con la búsqueda</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total === 1 ? "1 cuenta" : `${total} cuentas`} · saldo total{" "}
        <Balance
          amount={balanceTotal}
          className="font-medium text-foreground"
        />
      </p>

      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.user.id}>
            <Link
              href={accountHref(row)}
              className="block space-y-2 rounded-md border p-3 hover:bg-muted/50"
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
                <Balance
                  amount={row.balances.ledgerBalance}
                  className="shrink-0 text-base font-semibold"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                <StatusBadges row={row} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                <dt className="text-muted-foreground">Disponible</dt>
                <dd className="text-right">
                  <Balance amount={row.balances.spendableBalance} />
                </dd>
                {row.balances.activeHolds > 0 && (
                  <>
                    <dt className="text-muted-foreground">Retenido</dt>
                    <dd className="text-right">
                      <CreditAmount amount={row.balances.activeHolds} />
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Comprado / usado</dt>
                <dd className="text-right tabular-nums">
                  <CreditAmount amount={row.purchased} /> /{" "}
                  <CreditAmount amount={row.spent} />
                </dd>
                {row.lastActivityAt && (
                  <>
                    <dt className="text-muted-foreground">Último movimiento</dt>
                    <dd className="text-right">
                      {formatDateWithTime(row.lastActivityAt)}
                    </dd>
                  </>
                )}
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table className="border">
          <TableHeader>
            <TableRow>
              <TableHead>Participante</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Retenido</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead className="text-right">Comprado</TableHead>
              <TableHead className="text-right">Usado</TableHead>
              <TableHead
                className="text-right"
                title="Otorgados menos descontados por administradores, sin contar devoluciones"
              >
                Ajustes
              </TableHead>
              <TableHead>Último movimiento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.user.id}>
                <TableCell className="max-w-72">
                  <Link href={accountHref(row)} className="group block min-w-0">
                    <span className="block truncate font-medium group-hover:underline">
                      {getUserName(row.user) || row.user.email}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.user.email}
                    </span>
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <StatusBadges row={row} />
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  <Balance amount={row.balances.ledgerBalance} />
                </TableCell>
                <TableCell className="text-right">
                  <Balance amount={row.balances.activeHolds} />
                </TableCell>
                <TableCell className="text-right">
                  <Balance amount={row.balances.spendableBalance} />
                </TableCell>
                <TableCell className="text-right">
                  <Balance amount={row.purchased} />
                </TableCell>
                <TableCell className="text-right">
                  <Balance amount={row.spent} />
                </TableCell>
                <TableCell className="text-right">
                  <CreditAmount
                    amount={row.adminNet}
                    signed
                    className={cn(
                      "tabular-nums",
                      row.adminNet === 0 && "text-muted-foreground",
                    )}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {row.lastActivityAt
                    ? formatDateWithTime(row.lastActivityAt)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UsersTablePagination
        canNextPage={params.offset + params.limit < total}
        canPreviousPage={params.offset > 0}
        pageIndex={pageIndex}
        pageCount={pageCount}
        pageSize={String(params.limit)}
        rowCount={rows.length}
        total={total}
        pageSizes={CREDIT_ADMIN_PAGE_SIZES}
      />
    </div>
  );
}
