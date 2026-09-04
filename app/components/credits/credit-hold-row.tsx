import { LockIcon } from "lucide-react";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { type ActiveFeatureHold } from "@/app/lib/credits/queries";

/**
 * An active earmark, shown among the movements.
 *
 * Not a ledger entry: activating a feature reserves credits without charging
 * them (PRD §7.3), so nothing was posted and nothing was spent. It still
 * belongs in this list — it is the only reason a balance can be lower than the
 * history explains, and leaving it out made the wallet look like it had lost
 * track of 20 credits.
 *
 * Worded as reserved rather than spent, and dated from nothing: an earmark has
 * no posting date, and borrowing the activation's would imply an entry that
 * does not exist.
 */
export default function CreditHoldRow({ hold }: { hold: ActiveFeatureHold }) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <LockIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          Reservado para la mesa completa
        </p>
        <p className="text-xs text-muted-foreground">{hold.festivalName}</p>
        <p className="text-xs text-muted-foreground">
          Todavía no se descontaron. Se descuentan si reservás la mesa, y
          vuelven a estar disponibles si la liberás.
        </p>
      </div>
      <span className="shrink-0 text-sm font-medium text-muted-foreground">
        −{formatCreditCount(hold.amount)}
      </span>
    </li>
  );
}
