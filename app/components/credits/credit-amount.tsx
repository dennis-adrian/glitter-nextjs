/** One credit equals Bs 1, always shown with two decimals. */
export function formatCredits(amount: number): string {
  return `Bs${amount.toFixed(2)}`;
}

/**
 * A count of credits, for the places that are buying them rather than
 * reporting a balance: "20 créditos", not "Bs20.00 en créditos".
 *
 * Whole amounts lose their decimals — a price nobody set fractionally should
 * not read like one.
 */
export function formatCreditCount(amount: number): string {
  const count = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${count} ${amount === 1 ? "crédito" : "créditos"}`;
}

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
