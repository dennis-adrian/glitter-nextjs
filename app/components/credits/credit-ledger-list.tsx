import { PackageOpenIcon } from "lucide-react";
import React from "react";

import CreditAmount from "@/app/components/credits/credit-amount";
import CreditHoldRow, {
  type HoldEventKind,
} from "@/app/components/credits/credit-hold-row";
import CreditPendingPurchaseRow from "@/app/components/credits/credit-pending-purchase-row";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  type FeatureHold,
  type CreditWalletEntry,
  type CreditWalletTopUp,
} from "@/app/lib/credits/queries";

const TYPE_LABELS: Record<CreditWalletEntry["type"], string> = {
  top_up: "Compra de créditos",
  spend: "Uso de créditos",
  reversal: "Reversión por comprobante rechazado",
  admin_grant: "Créditos otorgados",
  admin_adjustment: "Ajuste administrativo",
};

function entryDetail(entry: CreditWalletEntry) {
  if (entry.invoiceId) return `Aplicado a la factura #${entry.invoiceId}`;
  if (entry.featureActionId) return "Función opcional de reserva";
  return entry.reason;
}

type CreditLedgerListProps = {
  entries: CreditWalletEntry[];
  /** Purchases still waiting on their voucher, which have no ledger entry yet. */
  pendingTopUps?: CreditWalletTopUp[];
  /**
   * Every feature earmark, open or closed. Reserving and releasing are the
   * only things that move a spendable balance without posting an entry, so
   * without them the list cannot account for the balance it sits under.
   */
  holds?: FeatureHold[];
};

type Row = { key: string; at: Date; node: React.ReactNode };

/**
 * Everything that moved this participant's balance, newest first.
 *
 * Not just the ledger: an unpaid purchase and a feature earmark both change
 * what the wallet says while posting nothing, and leaving either out made the
 * balance look wrong. They are interleaved by date rather than pinned above
 * the entries — this reads as one history, and an episode that opens with a
 * reservation and closes with a release only makes sense in order.
 */
export default function CreditLedgerList({
  entries,
  pendingTopUps = [],
  holds = [],
}: CreditLedgerListProps) {
  const rows: Row[] = [
    ...pendingTopUps.map((topUp) => ({
      key: `top-up-${topUp.id}`,
      at: topUp.createdAt,
      node: <CreditPendingPurchaseRow topUp={topUp} />,
    })),
    ...holds.flatMap((hold) => {
      const events: { kind: HoldEventKind; at: Date }[] = [
        { kind: "reserved", at: hold.reservedAt },
      ];
      // Capture gets no row: it posts a `spend`, and that entry already says
      // the credits were charged.
      if (
        hold.closedAt &&
        (hold.status === "released" || hold.status === "expired")
      ) {
        events.push({ kind: hold.status, at: hold.closedAt });
      }
      return events.map((event) => ({
        key: `hold-${hold.featureActionId}-${event.kind}`,
        at: event.at,
        node: <CreditHoldRow hold={hold} event={event.kind} />,
      }));
    }),
    ...entries.map((entry) => {
      const detail = entryDetail(entry);
      return {
        key: `entry-${entry.id}`,
        at: entry.createdAt,
        node: (
          <li className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{TYPE_LABELS[entry.type]}</p>
              {detail && (
                <p className="text-xs text-muted-foreground">{detail}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {formatDateWithTime(entry.createdAt)}
              </p>
            </div>
            <CreditAmount
              variant="count"
              amount={entry.amount}
              signed
              className={
                entry.amount > 0
                  ? "shrink-0 text-sm font-medium text-green-600"
                  : "shrink-0 text-sm font-medium"
              }
            />
          </li>
        ),
      };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <PackageOpenIcon className="h-10 w-10" />
            <span className="text-sm">Todavía no tenés movimientos</span>
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <React.Fragment key={row.key}>{row.node}</React.Fragment>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
