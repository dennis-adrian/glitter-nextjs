import { PackageOpenIcon } from "lucide-react";

import CreditAmount from "@/app/components/credits/credit-amount";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import { type CreditWalletEntry } from "@/app/lib/credits/queries";

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
};

/** The ledger is append-only, so every row here is permanent history. */
export default function CreditLedgerList({ entries }: CreditLedgerListProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <PackageOpenIcon className="h-10 w-10" />
            <span className="text-sm">Todavía no tenés movimientos</span>
          </div>
        ) : (
          <ul className="divide-y">
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
