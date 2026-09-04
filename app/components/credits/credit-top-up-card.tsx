import Link from "next/link";

import CreditAmount from "@/app/components/credits/credit-amount";
import { topUpReturn } from "@/app/components/credits/top-up-return";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import {
  type CreditTopUpDisplayStatus,
  type CreditWalletTopUp,
} from "@/app/lib/credits/queries";

const STATUS_LABELS: Record<CreditTopUpDisplayStatus, string> = {
  awaiting_voucher: "Falta el comprobante",
  under_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
};

const STATUS_VARIANTS: Record<CreditTopUpDisplayStatus, BadgeVariant> = {
  awaiting_voucher: "amber",
  under_review: "amber",
  approved: "green",
  rejected: "red",
  expired: "secondary",
};

function purposeLabel(topUp: CreditWalletTopUp) {
  if (topUp.intendedUseType === "invoice") return "Para el pago de una reserva";
  if (topUp.intendedUseType === "debt") return "Para regularizar tu saldo";
  return "Para una función opcional del festival";
}

/**
 * A finished purchase, for the history below the movements. Paying and
 * uploading the voucher live on the purchase's own page, so nothing here is
 * actionable — an unpaid purchase never reaches this card.
 */
type CreditTopUpCardProps = {
  topUp: CreditWalletTopUp;
  profileId: number;
};

export default function CreditTopUpCard({
  topUp,
  profileId,
}: CreditTopUpCardProps) {
  // The same destinations the purchase page redirects to when the voucher
  // lands, so a link here cannot point somewhere else than the flow did.
  const returnTo = topUpReturn(topUp, profileId);
  const reservationHref = returnTo?.kind === "invoice" ? returnTo.href : null;
  const featureHref = returnTo?.kind === "feature" ? returnTo.href : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">
              <CreditAmount variant="count" amount={topUp.amount} />
            </p>
            <p className="text-sm text-muted-foreground">
              {purposeLabel(topUp)}
            </p>
          </div>
          <Badge variant={STATUS_VARIANTS[topUp.status]}>
            {STATUS_LABELS[topUp.status]}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Iniciada el {formatDateWithTime(topUp.createdAt)}
        </p>

        {topUp.status === "under_review" && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Ya podés usar estos créditos en lo que quieras. Un administrador
            revisa el comprobante después; si algo no cuadra, te avisamos.
          </p>
        )}

        {topUp.status === "rejected" && topUp.rejectionReason && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            Motivo del rechazo: {topUp.rejectionReason}
          </p>
        )}

        {topUp.status === "expired" && (
          <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
            No recibimos el comprobante a tiempo, así que no se acreditó nada.
          </p>
        )}

        {reservationHref && (
          <Link
            href={reservationHref}
            className="inline-block text-sm text-primary underline underline-offset-2"
          >
            Ver el pago de la reserva
          </Link>
        )}

        {featureHref && (
          <Link
            href={featureHref}
            className="inline-block text-sm text-primary underline underline-offset-2"
          >
            Volver a la función del festival
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
