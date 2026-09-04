import { PackageOpenIcon } from "lucide-react";

import CreditAmount from "@/app/components/credits/credit-amount";
import CreditHoldRow from "@/app/components/credits/credit-hold-row";
import CreditPendingPurchaseRow from "@/app/components/credits/credit-pending-purchase-row";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  type ActiveFeatureHold,
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
  /**
   * Purchases still waiting on their voucher. They have no ledger entry yet,
   * and they are the one thing here the participant can still act on, so they
   * sit above the history rather than inside it.
   */
  pendingTopUps?: CreditWalletTopUp[];
  /**
   * Credits earmarked against an activated feature. They post no entry, so
   * without them the list cannot account for the balance it sits under.
   */
  activeHolds?: ActiveFeatureHold[];
};

/** The ledger is append-only, so every row here is permanent history. */
export default function CreditLedgerList({
  entries,
  pendingTopUps = [],
  activeHolds = [],
}: CreditLedgerListProps) {
  const isEmpty =
    entries.length === 0 &&
    pendingTopUps.length === 0 &&
    activeHolds.length === 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <PackageOpenIcon className="h-10 w-10" />
            <span className="text-sm">Todavía no tenés movimientos</span>
          </div>
        ) : (
          <ul className="divide-y">
            {pendingTopUps.map((topUp) => (
              <CreditPendingPurchaseRow
                key={`top-up-${topUp.id}`}
                topUp={topUp}
              />
            ))}
            {activeHolds.map((hold) => (
              <CreditHoldRow key={`hold-${hold.featureActionId}`} hold={hold} />
            ))}
            {entries.map((entry) => {
              const detail = entryDetail(entry);
              return (
                <li
                  key={entry.id}
                  className="flex items-start justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {TYPE_LABELS[entry.type]}
                    </p>
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
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
