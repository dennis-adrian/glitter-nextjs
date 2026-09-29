import { Badge } from "@/app/components/ui/badge";
import { formatMoney } from "@/app/lib/programs/pricing";
import { cn } from "@/app/lib/utils";

type Props = {
  code: string;
  partnerName: string;
  discountPercent: number;
  baseAmount: number;
  discountAmount: number;
  totalAmount: number;
  higherPriceAccepted: boolean;
  compact?: boolean;
};

export default function PromoPriceBreakdown({
  code,
  partnerName,
  discountPercent,
  baseAmount,
  discountAmount,
  totalAmount,
  higherPriceAccepted,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-card text-foreground",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Código promocional</p>
          <p className="font-semibold">{partnerName}</p>
        </div>
        <Badge variant="secondary">
          {code} · {discountPercent}%
        </Badge>
      </div>

      <dl className={cn("grid gap-1 text-sm", compact ? "mt-2" : "mt-4")}>
        <div className="flex justify-between gap-4 text-muted-foreground">
          <dt>Precio público</dt>
          <dd className="tabular-nums">{formatMoney(baseAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-secondary-foreground">
          <dt>Descuento del código</dt>
          <dd className="tabular-nums">−{formatMoney(discountAmount)}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-border pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(totalAmount)}</dd>
        </div>
      </dl>

      {higherPriceAccepted ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Elegiste este código aunque ya tenías un precio menor.
        </p>
      ) : null}
    </div>
  );
}
