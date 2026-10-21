import { GiftIcon } from "lucide-react";
import Link from "next/link";

import CreditGiftStartButton from "@/app/components/credit_gifts/admin/credit-gift-start-button";
import CreditGiftStatusBadge from "@/app/components/credit_gifts/admin/credit-gift-status-badge";
import CreditAmount from "@/app/components/credits/credit-amount";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import {
  CREDIT_GIFT_OCCASION_LABELS,
  creditGiftTotal,
} from "@/app/lib/credit_gifts/definitions";
import type { CreditGiftListRow } from "@/app/lib/credit_gifts/queries";
import { formatDateWithTime } from "@/app/lib/formatters";

export default function CreditGiftsList({
  gifts,
  blocker,
}: {
  gifts: CreditGiftListRow[];
  /** Why this admin cannot start a gift, or null when they can. */
  blocker: string | null;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-prose text-sm text-muted-foreground">
          Créditos que el equipo regaló a varios participantes a la vez, con un
          mensaje. Cada persona lo ve en su billetera y lo recibe por correo.
        </p>
        <CreditGiftStartButton blocker={blocker} />
      </div>

      {gifts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center text-muted-foreground">
          <GiftIcon className="h-10 w-10" aria-hidden />
          <p className="text-sm">Todavía no se regalaron créditos.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regalo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Por persona</TableHead>
                <TableHead className="text-right">Acreditados</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Leídos</TableHead>
                <TableHead>Enviado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gifts.map((gift) => (
                <TableRow key={gift.id}>
                  <TableCell className="min-w-56">
                    <Link
                      href={`/dashboard/credits/gifts/${gift.id}`}
                      className="font-medium hover:underline"
                    >
                      {gift.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {CREDIT_GIFT_OCCASION_LABELS[gift.occasion]}
                      {gift.counts.skipped > 0 &&
                        ` · ${gift.counts.skipped} omitido${gift.counts.skipped === 1 ? "" : "s"}`}
                      {gift.counts.revoked > 0 &&
                        ` · ${gift.counts.revoked} retirado${gift.counts.revoked === 1 ? "" : "s"}`}
                    </p>
                  </TableCell>
                  <TableCell>
                    <CreditGiftStatusBadge
                      status={gift.status}
                      failed={gift.counts.failed}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <CreditAmount amount={gift.amountPerRecipient} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {gift.counts.granted} de{" "}
                    {gift.counts.total - gift.counts.skipped}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <CreditAmount
                      amount={creditGiftTotal(
                        gift.amountPerRecipient,
                        gift.counts.granted - gift.counts.revoked,
                      )}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {gift.counts.read}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateWithTime(gift.createdAt)}
                    {gift.createdByName && (
                      <p className="text-xs text-muted-foreground">
                        Por {gift.createdByName}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
