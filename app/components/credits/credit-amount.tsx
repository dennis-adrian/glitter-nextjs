/** One credit equals Bs 1, always shown with two decimals. */
export function formatCredits(amount: number): string {
  return `Bs${amount.toFixed(2)}`;
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
