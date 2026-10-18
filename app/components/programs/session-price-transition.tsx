import { formatSessionPrice, isFreePrice } from "@/app/lib/programs/pricing";
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
    return <span className={className}>{formatSessionPrice(price)}</span>;
  }

  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1.5 whitespace-nowrap",
        className,
      )}
      aria-label={`Antes ${formatSessionPrice(previousPrice)}; ahora ${isFreePrice(price) ? "sin costo" : formatSessionPrice(price)}`}
    >
      <span aria-hidden="true" className="line-through opacity-65">
        {formatSessionPrice(previousPrice)}
      </span>{" "}
      <span aria-hidden="true">{formatSessionPrice(price)}</span>
    </span>
  );
}
