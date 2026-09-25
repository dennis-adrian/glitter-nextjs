import CreditAmount from "@/app/components/credits/credit-amount";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import {
  CREDIT_TOP_UP_PURPOSE_LABELS,
  CREDIT_TOP_UP_STATUS_LABELS,
} from "@/app/lib/credits/admin-definitions";
import type { CreditAdminTopUp } from "@/app/lib/credits/admin-queries";
import { formatDateWithTime } from "@/app/lib/formatters";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  under_review: "amber",
  approved: "green",
  rejected: "red",
  expired: "secondary",
  awaiting_voucher: "amber",
};

/**
 * Every purchase the participant opened. Unlike the ledger, this includes the
 * ones that never got a voucher: they posted nothing, but they explain a
 * participant saying "I tried to buy credits".
 */
export default function CreditAccountTopUps({
  topUps,
}: {
  topUps: CreditAdminTopUp[];
}) {
  if (topUps.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nunca abrió una compra de créditos.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-md border">
      {topUps.map((topUp) => (
        <li
          key={topUp.id}
          className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Compra #{topUp.id}
              <Badge
                size="sm"
                variant={STATUS_VARIANTS[topUp.status] ?? "secondary"}
              >
                {CREDIT_TOP_UP_STATUS_LABELS[topUp.status] ?? topUp.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {CREDIT_TOP_UP_PURPOSE_LABELS[topUp.intendedUseType] ??
                topUp.intendedUseType}{" "}
              · abierta {formatDateWithTime(topUp.createdAt)}
              {topUp.submittedAt &&
                ` · comprobante ${formatDateWithTime(topUp.submittedAt)}`}
            </p>
            {topUp.reviewedAt && (
              <p className="text-xs text-muted-foreground">
                Revisada {formatDateWithTime(topUp.reviewedAt)}
                {topUp.reviewerName && ` por ${topUp.reviewerName}`}
              </p>
            )}
            {topUp.rejectionReason && (
              <p className="text-xs text-muted-foreground">
                Motivo: {topUp.rejectionReason}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
            <CreditAmount
              amount={topUp.amount}
              className="text-sm font-semibold tabular-nums"
            />
            {topUp.voucherUrl && (
              <a
                href={topUp.voucherUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-2 hover:underline"
              >
                Ver comprobante
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
