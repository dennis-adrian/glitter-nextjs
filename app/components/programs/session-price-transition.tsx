import { formatMoney } from "@/app/lib/programs/pricing";
import { cn } from "@/app/lib/utils";

type Props = {
  price: number;
  previousPrice?: number | null;
  className?: string;
};

export default function SessionPriceTransition({
  price,
  previousPrice,
  className,
}: Props) {
  if (
    previousPrice === null ||
    previousPrice === undefined ||
    previousPrice <= price
  ) {
    return <span className={className}>{formatMoney(price)}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap",
        className,
      )}
      aria-label={`Antes ${formatMoney(previousPrice)}; ahora ${formatMoney(price)}`}
    >
      <span aria-hidden="true" className="line-through opacity-65">
        {formatMoney(previousPrice)}
      </span>{" "}
      <span aria-hidden="true">{formatMoney(price)}</span>
    </span>
  );
}
