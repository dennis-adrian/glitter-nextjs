import Link from "next/link";

import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import type { FeatureHold } from "@/app/lib/credits/queries";
import { formatDateWithTime } from "@/app/lib/formatters";

const STATUS: Record<
  FeatureHold["status"],
  { label: string; variant: BadgeVariant }
> = {
  active: { label: "Retenido", variant: "amber" },
  captured: { label: "Cobrado", variant: "green" },
  released: { label: "Liberado", variant: "secondary" },
  expired: { label: "Vencido", variant: "secondary" },
};

/**
 * Every full-table earmark, open or closed. Holds move the spendable balance
 * without a ledger entry, so without them the history cannot explain a dip.
 */
export default function CreditHoldHistory({ holds }: { holds: FeatureHold[] }) {
  if (holds.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nunca activó una función con créditos retenidos.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {holds.map((hold) => (
        <li
          key={hold.featureActionId}
          className="flex items-start justify-between gap-3 p-3"
        >
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Mesa completa
              <Badge size="sm" variant={STATUS[hold.status].variant}>
                {STATUS[hold.status].label}
              </Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              <Link
                href={`/dashboard/festivals/${hold.festivalId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                {hold.festivalName}
              </Link>{" "}
              · activada {formatDateWithTime(hold.reservedAt)}
              {hold.closedAt &&
                ` · cerrada ${formatDateWithTime(hold.closedAt)}`}
            </p>
          </div>
          <CreditAmount
            amount={hold.amount}
            className="shrink-0 text-sm font-semibold tabular-nums"
          />
        </li>
      ))}
    </ul>
  );
}
