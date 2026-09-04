import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";

import Title from "@/app/components/atoms/heading";
import { formatCreditCount } from "@/app/components/credits/credit-amount";
import CreditPurchaseOutcome from "@/app/components/credits/credit-purchase-outcome";
import CreditTopUpVoucherUpload from "@/app/components/credits/credit-top-up-voucher-upload";
import { PaymentQRCode } from "@/app/components/payments/payment-qr-code";
import { Badge, type BadgeVariant } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { formatDateWithTime } from "@/app/lib/formatters";
import { getQrCodeForAmount } from "@/app/lib/qr_codes/actions";
import { type CreditWalletTopUp } from "@/app/lib/credits/queries";

const STATUS_LABELS = {
  under_review: "Comprobante recibido",
  approved: "Aprobada",
  rejected: "Rechazada",
  expired: "Vencida",
} as const;

const STATUS_VARIANTS: Record<keyof typeof STATUS_LABELS, BadgeVariant> = {
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

type CreditPurchaseProps = {
  topUp: CreditWalletTopUp;
};

/**
 * One purchase, on a page of its own.
 *
 * Paying and uploading the voucher used to sit inside the wallet, next to the
 * balance and the history, which put a timed task in the middle of a page
 * people open to read. Here there is one amount, one QR and one thing to do —
 * and no way to finish the purchase without doing it, because submitting the
 * voucher is what issues the credits.
 */
export default async function CreditPurchase({ topUp }: CreditPurchaseProps) {
  // Exact amount when the team pre-generated one, otherwise the shared
  // zero-amount code the payer types the amount into.
  const qrCode =
    topUp.status === "awaiting_voucher"
      ? await getQrCodeForAmount(topUp.amount)
      : null;

  return (
    <div className="container max-w-[560px] p-3 md:p-6">
      <Link
        href="/my_credits"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Mis créditos
      </Link>

      <div className="mb-4 flex flex-col gap-1 md:gap-2">
        <Title>Compra de créditos</Title>
        <p className="text-sm leading-tight text-muted-foreground md:text-base">
          {purposeLabel(topUp)}
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <div className="flex items-start justify-between gap-3">
            <dl>
              <dt className="text-sm text-muted-foreground">Vas a recibir</dt>
              <dd className="text-3xl font-semibold tabular-nums">
                {formatCreditCount(topUp.amount)}
              </dd>
            </dl>
            {topUp.status !== "awaiting_voucher" && (
              <Badge variant={STATUS_VARIANTS[topUp.status]}>
                {STATUS_LABELS[topUp.status]}
              </Badge>
            )}
          </div>

          {topUp.status === "awaiting_voucher" ? (
            <>
              <div className="flex flex-col items-center gap-2">
                {/* The amount is stated once, by the upload block below. This
                    line only says what to do with the code. */}
                <p className="text-center text-sm text-muted-foreground">
                  {qrCode
                    ? "Escaneá este código con tu app de banco o de pago."
                    : "Todavía no hay un código QR cargado. Escribinos para coordinar el pago."}
                </p>
                {qrCode && (
                  <PaymentQRCode
                    amount={topUp.amount}
                    qrCodeUrl={qrCode.qrCodeUrl}
                    qrCoversAmount={qrCode.amount === topUp.amount}
                  />
                )}
              </div>

              {/* The only way out of this screen with credits in hand. There is
                  no "lo subo después": the voucher is what issues them. */}
              <CreditTopUpVoucherUpload
                topUpId={topUp.id}
                amount={topUp.amount}
                uploadDeadlineAt={topUp.uploadDeadlineAt.toISOString()}
                redirectTo="/my_credits"
                clearFullTableDismissalFor={
                  // `feature` is only ever the full table today, and its
                  // `intendedUseId` is the festival — the same pair the server
                  // reads to activate the access this purchase funds.
                  topUp.intendedUseType === "feature"
                    ? (topUp.intendedUseId ?? undefined)
                    : undefined
                }
              />
            </>
          ) : (
            <CreditPurchaseOutcome topUp={topUp} />
          )}

          <p className="text-xs text-muted-foreground">
            Iniciada el {formatDateWithTime(topUp.createdAt)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
