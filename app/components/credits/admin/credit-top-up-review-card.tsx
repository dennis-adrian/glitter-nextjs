"use client";

import Link from "next/link";
import { useState } from "react";

import CreditAmount from "@/app/components/credits/credit-amount";
import CreditTopUpReviewDialog from "@/app/components/credits/admin/credit-top-up-review-dialog";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import { type CreditTopUpReviewItem } from "@/app/lib/credits/queries";
import { getUserName } from "@/app/lib/users/utils";

const DECISION_LABELS: Record<string, string> = {
  under_review: "En revisión",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
  awaiting_voucher: "Falta el comprobante",
};

const DECISION_VARIANTS: Record<string, BadgeVariant> = {
  under_review: "amber",
  approved: "green",
  rejected: "red",
  expired: "secondary",
  awaiting_voucher: "amber",
};

function purposeLabel(item: CreditTopUpReviewItem) {
  if (item.intendedUseType === "invoice") return "Pago de reserva";
  if (item.intendedUseType === "debt") return "Regularización de saldo";
  return "Función opcional";
}

type CreditTopUpReviewCardProps = {
  item: CreditTopUpReviewItem;
  canReview: boolean;
};

export default function CreditTopUpReviewCard({
  item,
  canReview,
}: CreditTopUpReviewCardProps) {
  const [open, setOpen] = useState(false);
  const participantName = getUserName(item.user) || item.user.email;
  const spentSinceSubmission = item.recentSpends.reduce(
    (total, spend) => total + Math.abs(spend.amount),
    0,
  );
  const invoiceHref = item.invoiceReservationId
    ? `/dashboard/reservations/${item.invoiceReservationId}/payments`
    : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              <CreditAmount amount={item.amount} />
            </p>
            <p className="truncate text-sm">{participantName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.user.email}
            </p>
          </div>
          <Badge variant={DECISION_VARIANTS[item.status] ?? "secondary"}>
            {DECISION_LABELS[item.status] ?? item.status}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Destino</dt>
          <dd className="text-right">{purposeLabel(item)}</dd>
          <dt className="text-muted-foreground">Enviada</dt>
          <dd className="text-right">
            {item.submittedAt ? formatDateWithTime(item.submittedAt) : "—"}
          </dd>
          <dt className="text-muted-foreground">Saldo actual</dt>
          <dd className="text-right">
            <CreditAmount amount={item.balances.ledgerBalance} />
          </dd>
          {item.reviewedAt && (
            <>
              <dt className="text-muted-foreground">Revisada</dt>
              <dd className="text-right">
                {formatDateWithTime(item.reviewedAt)}
              </dd>
            </>
          )}
        </dl>

        {item.rejectionReason && (
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            Motivo: {item.rejectionReason}
          </p>
        )}

        {invoiceHref && (
          <Link
            href={invoiceHref}
            className="inline-block text-xs text-primary underline underline-offset-2"
          >
            Ver los pagos de la reserva
          </Link>
        )}

        {item.status === "under_review" && (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setOpen(true)}
            >
              Revisar comprobante
            </Button>
            <CreditTopUpReviewDialog
              topUpId={item.id}
              amount={item.amount}
              participantName={participantName}
              voucherUrl={item.voucherUrl}
              ledgerBalance={item.balances.ledgerBalance}
              balanceAfterReversal={item.balanceAfterReversal}
              spentSinceSubmission={spentSinceSubmission}
              canReview={canReview}
              open={open}
              onOpenChange={setOpen}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
