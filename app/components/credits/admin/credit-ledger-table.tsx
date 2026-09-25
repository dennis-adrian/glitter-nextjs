import { PackageOpenIcon } from "lucide-react";
import Link from "next/link";

import CreditRevertButton from "@/app/components/credits/admin/credit-revert-button";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import UsersTablePagination from "@/app/components/users/users-table-pagination";
import {
  canRevertCreditEntry,
  CREDIT_ADMIN_PAGE_SIZES,
  CREDIT_DEBT_RESOLUTION_LABELS,
  CREDIT_LEDGER_KIND_LABELS,
  CREDIT_TOP_UP_STATUS_LABELS,
  type CreditLedgerSearchParams,
} from "@/app/lib/credits/admin-definitions";
import {
  fetchCreditLedger,
  type CreditLedgerRow,
} from "@/app/lib/credits/admin-queries";
import { formatDateWithTime } from "@/app/lib/formatters";
import { featureActionLabel } from "@/app/lib/payments/feature-credits";
import { canMutateAdminReservations } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
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

type CreditLedgerTableProps = {
  params: CreditLedgerSearchParams;
  /** Off on a single account's page, where every row is the same person. */
  showUser?: boolean;
};

export default async function CreditLedgerTable({
  params,
  showUser = true,
}: CreditLedgerTableProps) {
  const [actor, page] = await Promise.all([
    getCurrentUserProfile(),
    fetchCreditLedger({
      query: params.query,
      userId: params.userId,
      festivalId: params.festivalId,
      kinds: params.kind,
      from: params.from,
      to: params.to,
      limit: params.limit,
      offset: params.offset,
    }),
  ]);
  if (!page) return null;

  const canAdjust = canMutateAdminReservations(actor);
  const { rows, total, creditsIn, creditsOut } = page;
  const pageCount = Math.ceil(total / params.limit);
  const pageIndex = Math.floor(params.offset / params.limit) + 1;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
        <PackageOpenIcon className="h-12 w-12" />
        <span className="text-sm">
          Ningún movimiento coincide con el filtro
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {total === 1 ? "1 movimiento" : `${total} movimientos`} · entradas{" "}
        <CreditAmount
          amount={creditsIn}
          signed
          className="font-medium text-green-700"
        />{" "}
        · salidas <CreditAmount amount={creditsOut} className="font-medium" /> ·
        neto{" "}
        <CreditAmount
          amount={creditsIn + creditsOut}
          signed
          className="font-medium text-foreground"
        />
      </p>

      <ul className="divide-y rounded-md border">
        {rows.map((row) => {
          const reverted = revertedLabel(row);
          return (
            <li
              key={row.id}
              className={cn(
                "grid gap-2 p-3 md:items-start md:gap-4",
                showUser
                  ? "md:grid-cols-[9.5rem_minmax(0,14rem)_minmax(0,1fr)_auto]"
                  : "md:grid-cols-[9.5rem_minmax(0,1fr)_auto]",
              )}
            >
              <div className="text-xs text-muted-foreground">
                <p>{formatDateWithTime(row.createdAt)}</p>
                <p>#{row.id}</p>
              </div>

              {showUser && (
                <Link
                  href={`/dashboard/credits/accounts/${row.user.id}`}
                  className="group min-w-0"
                >
                  <span className="block truncate text-sm group-hover:underline">
                    {getUserName(row.user) || row.user.email}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.user.email}
                  </span>
                </Link>
              )}

              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {CREDIT_LEDGER_KIND_LABELS[row.kind]}
                  {reverted && (
                    <Badge size="sm" variant="secondary">
                      {reverted}
                    </Badge>
                  )}
                </div>
                {row.reason && (
                  <p className="text-sm text-muted-foreground">{row.reason}</p>
                )}
                <EntryContext row={row} />
                {row.actor && (
                  <p className="text-xs text-muted-foreground">
                    Por {row.actor.name}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 md:flex-col md:items-end">
                <CreditAmount
                  amount={row.amount}
                  signed
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    row.amount > 0 && "text-green-700",
                  )}
                />
                {canAdjust && canRevertCreditEntry(row) && (
                  <CreditRevertButton
                    userId={row.user.id}
                    entryId={row.id}
                    amount={row.amount}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
