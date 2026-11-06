import { formatCreditCount, formatCredits } from "@/app/lib/credits/format";

// Server code imports these from app/lib/credits/format, not from a component.
export { formatCreditCount, formatCredits };

type CreditAmountProps = {
  amount: number;
  /** Prefixes a positive amount with `+` so ledger direction reads at a glance. */
  signed?: boolean;
  className?: string;
  /**
   * How to word it. "count" for anything a participant reads — their wallet
   * holds credits, not bolivianos, and the exchange rate is only their
   * business at the moment they pay. "money" stays the default so admin
   * screens, which reconcile against real transfers, are unchanged.
   */
  variant?: "money" | "count";
};

export default function CreditAmount({
  amount,
  signed = false,
  className,
  variant = "money",
}: CreditAmountProps) {
  const sign = signed && amount > 0 ? "+" : amount < 0 ? "-" : "";
  const format = variant === "count" ? formatCreditCount : formatCredits;
  return (
    <span className={className}>
      {sign}
      {format(Math.abs(amount))}
    </span>
  );
}
