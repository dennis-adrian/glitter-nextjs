import Link from "next/link";

import { ChevronRightIcon, CircleAlertIcon, CoinsIcon } from "lucide-react";

import { HubSection } from "@/app/components/participations/hub/hub-section";
import type { CreditBalances } from "@/app/lib/credits/balances";
import { formatCreditCount } from "@/app/lib/credits/format";
import { cn } from "@/app/lib/utils";

/**
 * The credit balance, always shown (even at zero), with what is still under
 * review, or the debt when there is one. The row opens the wallet.
 */
export default function HomeCredits({
  balances,
}: {
  balances: Pick<
    CreditBalances,
    "ledgerBalance" | "spendableBalance" | "underReviewIssuance"
  >;
}) {
  const debt = Math.max(0, -balances.ledgerBalance);
  const available = Math.max(0, balances.spendableBalance);
  const Icon = debt > 0 ? CircleAlertIcon : CoinsIcon;

  return (
    <HubSection title="Tus créditos">
      <div className="flex flex-col gap-2">
        <Link
          href="/my_credits"
          className={cn(
            "flex items-center gap-3 rounded-2xl border p-4 hover:border-brand-primary",
            debt > 0
              ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
              : "border-brand-border bg-brand-card",
          )}
        >
          <Icon
            className={cn(
              "size-6 shrink-0",
              debt > 0 ? "text-amber-700 dark:text-amber-300" : "text-amber-500",
            )}
            aria-hidden="true"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-display text-lg font-bold text-brand-ink">
              {debt > 0
                ? `Debés ${formatCreditCount(debt)}`
                : `${formatCreditCount(available)} disponibles`}
            </span>
            {debt > 0 ? (
              <span className="text-sm text-amber-900 dark:text-amber-100">
                Hasta regularizarlo no podés reservar
              </span>
            ) : balances.underReviewIssuance > 0 ? (
              <span className="text-sm text-brand-neutral">
                {formatCreditCount(balances.underReviewIssuance)} en revisión
              </span>
            ) : null}
          </span>
          <ChevronRightIcon
            className="size-4 shrink-0 text-brand-neutral"
            aria-hidden="true"
          />
        </Link>
        <Link
          href="/credits_info"
          className="self-start text-sm font-semibold text-brand-primary hover:underline"
        >
          Cómo funcionan los créditos
        </Link>
      </div>
    </HubSection>
  );
}
