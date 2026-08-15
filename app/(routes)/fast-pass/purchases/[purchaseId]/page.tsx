import type { Metadata } from "next";
import { notFound } from "next/navigation";

import SecureLinkNotice from "@/app/components/programs/secure-link-notice";
import FastPassBuyerCancelButton from "@/app/components/fast-pass/payment/buyer-cancel-button";
import FastPassPurchaseTicketCard from "@/app/components/fast-pass/payment/purchase-ticket-card";
import FastPassVoucherUploadCard from "@/app/components/fast-pass/payment/voucher-upload-card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccessFromSubject } from "@/app/lib/fast-pass/access";
import { FAST_PASS_PURCHASE_STATUS_LABELS } from "@/app/lib/fast-pass/definitions";
import { buildSecureLinkUrl } from "@/app/lib/fast-pass/notifications";
import { fetchPurchaseForAccess } from "@/app/lib/fast-pass/purchase-queries";
import {
  resolveBuyerCancellation,
  resolveVoucherSubmission,
} from "@/app/lib/fast-pass/state";
import { getQrCodeForAmount } from "@/app/lib/qr_codes/actions";
import { generateQrDataUrl } from "@/app/lib/utils";
import { formatFullDate } from "@/app/lib/formatters";

export const metadata: Metadata = {
  title: "Tu Pase Rápido",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ purchaseId: string }>;
  searchParams: Promise<{ token?: unknown }>;
};

export default async function FastPassPurchasePage({
  params,
  searchParams,
}: Props) {
  await requireFeatureEnabled("fast_pass");

  const [{ purchaseId: purchaseIdParam }, resolvedSearchParams] =
    await Promise.all([params, searchParams]);

  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token
      : undefined;
  const purchaseId = Number(purchaseIdParam);
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) notFound();

  const purchase = await fetchPurchaseForAccess(purchaseId);
  if (!purchase) notFound();

  const access = resolvePurchaseAccessFromSubject(purchase, token);
  if (!access.granted) notFound();

  const voucherCheck = resolveVoucherSubmission(purchase);
  const showPaymentStep = voucherCheck.allowed;
  const buyerCancel = resolveBuyerCancellation(purchase);
  const canBuyerCancel = buyerCancel.allowed && Boolean(token);

  const tickets = await Promise.all(
    purchase.lines.map(async (line) => ({
      line,
      qrDataUrl:
        line.ticket && line.ticket.status === "valid"
          ? await generateQrDataUrl(line.ticket.code)
          : null,
    })),
  );

  const qrCode = showPaymentStep
    ? await getQrCodeForAmount(purchase.totalAmount)
    : null;

  const festivalDateLabel = purchase.festivalDate
    ? formatFullDate(purchase.festivalDate.startDate)
    : "Día de festival";

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Tu Pase Rápido</h1>
        <p className="text-sm text-muted-foreground">
          {festivalDateLabel} ·{" "}
          {FAST_PASS_PURCHASE_STATUS_LABELS[purchase.status]}
        </p>
      </header>

      {showPaymentStep ? (
        <FastPassVoucherUploadCard
          purchaseId={purchase.id}
          token={token}
          totalAmount={purchase.totalAmount}
          bankQrImageUrl={
            qrCode?.qrCodeUrl ?? purchase.settings.bankQrImageUrl ?? null
          }
          holdExpiresAt={
            purchase.status === "pending_upload"
              ? purchase.holdExpiresAt
              : purchase.status === "changes_requested"
                ? purchase.correctionExpiresAt
                : null
          }
          vouchers={purchase.vouchers}
          changesRequested={purchase.status === "changes_requested"}
        />
      ) : null}

      {purchase.status === "approved" ? (
        <div className="space-y-4">
          {tickets.map(({ line, qrDataUrl }) =>
            line.ticket ? (
              <FastPassPurchaseTicketCard
                key={line.id}
                holderName={
                  [line.holderFirstName, line.holderLastName]
                    .filter(Boolean)
                    .join(" ") || null
                }
                festivalDateLabel={festivalDateLabel}
                ticketCode={line.ticket.code}
                ticketStatus={line.ticket.status}
                qrDataUrl={qrDataUrl}
                childCount={line.responsibleChildCount}
                editHolder={
                  token &&
                  line.holderFirstName &&
                  line.holderLastName &&
                  line.holderEmail &&
                  line.holderPhone &&
                  line.holderGender &&
                  line.holderBirthdate
                    ? {
                        purchaseId: purchase.id,
                        purchaseLineId: line.id,
                        token,
                        firstName: line.holderFirstName,
                        lastName: line.holderLastName,
                        email: line.holderEmail,
                        phone: line.holderPhone,
                        gender: line.holderGender,
                        birthdate: line.holderBirthdate,
                      }
                    : null
                }
              />
            ) : null,
          )}
        </div>
      ) : null}

      {canBuyerCancel && token ? (
        <div className="space-y-2 rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Cancelá solo si todavía no transferiste. Si ya pagaste, subí el
            comprobante.
          </p>
          <FastPassBuyerCancelButton purchaseId={purchase.id} token={token} />
        </div>
      ) : null}

      {token ? (
        <SecureLinkNotice url={buildSecureLinkUrl(purchase.id, token)} />
      ) : null}
    </div>
  );
}
