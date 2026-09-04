import { LockIcon, LockOpenIcon } from "lucide-react";

import { formatCreditCount } from "@/app/components/credits/credit-amount";
import { formatDateWithTime } from "@/app/lib/formatters";
import { type FeatureHold } from "@/app/lib/credits/queries";

export type HoldEventKind = "reserved" | "released" | "expired";

/**
 * One thing that happened to a feature earmark, shown among the movements.
 *
 * Not a ledger entry: activating a feature reserves credits without charging
 * them (PRD §7.3), so nothing is posted and nothing is spent. Reserving and
 * releasing are still the only two things that move a spendable balance
 * without leaving a trace in the ledger, which is exactly why they belong
 * here — showing only open earmarks made the whole episode vanish on release
 * and left an unexplained dip in the history.
 *
 * Capture has no row of its own: it posts a `spend`, and that entry already
 * says the credits were charged.
 */
export default function CreditHoldRow({
  hold,
  event,
}: {
  hold: FeatureHold;
  event: HoldEventKind;
}) {
  const reserved = event === "reserved";
  const at = reserved ? hold.reservedAt : hold.closedAt;

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {reserved ? (
            <LockIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <LockOpenIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          {reserved
            ? "Créditos reservados para la mesa completa"
            : event === "expired"
              ? "Reserva de créditos vencida"
              : "Reserva de créditos liberada"}
        </p>
        <p className="text-xs text-muted-foreground">{hold.festivalName}</p>
        {reserved && hold.status === "active" && (
          <p className="text-xs text-muted-foreground">
            Todavía no se descontaron. Se descuentan si reservás la mesa, y
            vuelven a estar disponibles si la liberás.
          </p>
        )}
        {!reserved && (
          <p className="text-xs text-muted-foreground">
            Volvieron a estar disponibles.
          </p>
        )}
        {at && (
          <p className="text-xs text-muted-foreground">
            {formatDateWithTime(at)}
          </p>
        )}
      </div>
      {/* Signed the way the balance moved, not the way money did: reserving
          takes credits out of what can be spent and releasing puts them back,
          while the ledger total never changes either way. */}
      <span className="shrink-0 text-sm font-medium text-muted-foreground">
        {reserved ? "-" : "+"}
        {formatCreditCount(hold.amount)}
      </span>
    </li>
  );
}
