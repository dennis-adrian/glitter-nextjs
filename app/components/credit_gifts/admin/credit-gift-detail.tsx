import CreditGiftAutoRefresh from "@/app/components/credit_gifts/admin/credit-gift-auto-refresh";
import CreditGiftKpi from "@/app/components/credit_gifts/admin/credit-gift-kpi";
import CreditGiftRecipientsTable from "@/app/components/credit_gifts/admin/credit-gift-recipients-table";
import CreditGiftStatusBadge from "@/app/components/credit_gifts/admin/credit-gift-status-badge";
import CreditAmount from "@/app/components/credits/credit-amount";
import { Card, CardContent } from "@/app/components/ui/card";
import {
  CREDIT_GIFT_OCCASION_LABELS,
  creditGiftTotal,
} from "@/app/lib/credit_gifts/definitions";
import type { CreditGiftDetail as CreditGiftDetailData } from "@/app/lib/credit_gifts/queries";
import { formatDateWithTime } from "@/app/lib/formatters";

export default function CreditGiftDetail({
  gift,
  canMutate,
}: {
  gift: CreditGiftDetailData;
  canMutate: boolean;
}) {
  const { counts } = gift;
  const netGranted = counts.granted - counts.revoked;

  return (
    <div className="space-y-4 overflow-y-auto pb-6">
      <CreditGiftAutoRefresh active={gift.status === "processing"} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{gift.title}</h2>
            <CreditGiftStatusBadge
              status={gift.status}
              failed={counts.failed}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {CREDIT_GIFT_OCCASION_LABELS[gift.occasion]} ·{" "}
            <CreditAmount amount={gift.amountPerRecipient} /> por persona ·{" "}
            {formatDateWithTime(gift.createdAt)}
            {gift.createdByName && ` · Por ${gift.createdByName}`}
          </p>
        </div>
      </div>

      {gift.status === "processing" && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Estamos acreditando los créditos y enviando los avisos. Esta página se
          actualiza sola.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <CreditGiftKpi
          label="Acreditados"
          value={`${counts.granted} de ${counts.total - counts.skipped}`}
        />
        <CreditGiftKpi label="Omitidos" value={counts.skipped} />
        <CreditGiftKpi label="Con error" value={counts.failed} />
        <CreditGiftKpi label="Leídos en la app" value={counts.read} />
        <CreditGiftKpi label="Correos enviados" value={counts.emailsSent} />
        <CreditGiftKpi
          label="Total vigente"
          value={
            <CreditAmount
              amount={creditGiftTotal(gift.amountPerRecipient, netGranted)}
            />
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs font-medium text-muted-foreground">
              Mensaje para el participante
            </p>
            <p className="font-medium">{gift.title}</p>
            <p className="whitespace-pre-line text-sm">{gift.message}</p>
            <p className="text-xs text-muted-foreground">
              Firmado por Productora Glitter. {"{nombre}"} se reemplaza por el
              nombre de cada persona.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs font-medium text-muted-foreground">
              Nota interna
            </p>
            <p className="whitespace-pre-line text-sm">{gift.internalNote}</p>
            <p className="text-xs text-muted-foreground">
              Solo la ve el equipo.
            </p>
          </CardContent>
        </Card>
      </div>

      <CreditGiftRecipientsTable
        campaignId={gift.id}
        amountPerRecipient={gift.amountPerRecipient}
        recipients={gift.recipients}
        canMutate={canMutate}
      />
    </div>
  );
}
