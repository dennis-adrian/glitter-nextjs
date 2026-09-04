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
};

export default function CreditAmount({
  amount,
  signed = false,
  className,
}: CreditAmountProps) {
  const sign = signed && amount > 0 ? "+" : amount < 0 ? "-" : "";
  return (
    <span className={className}>
      {sign}
      {formatCredits(Math.abs(amount))}
    </span>
  );
}
