import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import CreditAmount from "@/app/components/credits/credit-amount";
import { formatDateWithTime } from "@/app/lib/formatters";
import { type CreditWalletTopUp } from "@/app/lib/credits/queries";

/**
 * A purchase that has not been paid yet, shown among the movements.
 *
 * It is not a ledger entry — nothing has been issued until the voucher is in —
 * so it carries no amount in the running balance and reads as an unfinished
 * errand instead: one line, and a way back to the screen that finishes it.
 */
export default function CreditPendingPurchaseRow({
  topUp,
}: {
  topUp: CreditWalletTopUp;
}) {
  return (
    <li>
      <Link
        href={`/my_credits/${topUp.id}`}
        className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-3 hover:bg-muted"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium">Compra de créditos en curso</p>
          <p className="text-xs text-amber-700">
            Falta el comprobante · tocá para pagar
          </p>
          <p className="text-xs text-muted-foreground">
            Iniciada el {formatDateWithTime(topUp.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <CreditAmount amount={topUp.amount} className="text-sm font-medium" />
          <ChevronRightIcon className="h-4 w-4" />
        </div>
      </Link>
    </li>
  );
}
