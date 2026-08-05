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
        "rounded-xl border border-[#9347f5]/20 bg-[#fffaf3] text-[#4b255f]",
        compact ? "p-3" : "p-4",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide">
            Código promocional
          </p>
          <p className="font-semibold">{partnerName}</p>
        </div>
        <Badge className="bg-[#9347f5] text-white hover:bg-[#9347f5]">
          {code} · {discountPercent}%
        </Badge>
      </div>

      <dl className={cn("grid gap-1 text-sm", compact ? "mt-2" : "mt-4")}>
        <div className="flex justify-between gap-4 text-[#70566f]">
          <dt>Precio público</dt>
          <dd>{formatMoney(baseAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 text-[#e639b5]">
          <dt>Descuento del código</dt>
          <dd>−{formatMoney(discountAmount)}</dd>
        </div>
        <div className="mt-1 flex justify-between gap-4 border-t border-[#4b255f]/15 pt-2 text-base font-black">
          <dt>Total</dt>
          <dd>{formatMoney(totalAmount)}</dd>
        </div>
      </dl>

      {higherPriceAccepted ? (
        <p className="mt-2 text-xs text-[#70566f]">
          Elegiste este código aunque ya tenías un precio menor.
        </p>
      ) : null}
    </div>
  );
}
