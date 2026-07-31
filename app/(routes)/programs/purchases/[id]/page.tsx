import type { Metadata } from "next";
import { notFound } from "next/navigation";

import ProgramViewTracker from "@/app/components/programs/program-view-tracker";
import PurchaseTicketCard from "@/app/components/programs/purchase-ticket-card";
import SecureLinkNotice from "@/app/components/programs/secure-link-notice";
import VoucherUploadCard from "@/app/components/programs/voucher-upload-card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { resolvePurchaseAccessWithLazyViewer } from "@/app/lib/programs/access";
import { SESSION_PURCHASE_STATUS_LABELS } from "@/app/lib/programs/definitions";
import { buildSecureLinkUrl } from "@/app/lib/programs/notifications";
import { fetchPurchaseForAccess } from "@/app/lib/programs/purchase-queries";
import { getQrCodeForAmount } from "@/app/lib/qr_codes/actions";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import { acceptsVouchers } from "@/app/lib/programs/vouchers";
import { generateQrDataUrl } from "@/app/lib/utils";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

/** Never indexed: the URL carries a credential. */
export const metadata: Metadata = {
  title: "Tu inscripción",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: unknown }>;
};

export default async function PurchaseAccessPage({
  params,
  searchParams,
}: Props) {
  await requireFeatureEnabled("paid_programs");

  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const token =
    typeof resolvedSearchParams.token === "string"
      ? resolvedSearchParams.token
      : undefined;
  const purchaseId = Number(id);
  if (!Number.isInteger(purchaseId) || purchaseId <= 0) notFound();

  const purchase = await fetchPurchaseForAccess(purchaseId);
  if (!purchase) notFound();

  const { access } = await resolvePurchaseAccessWithLazyViewer({
    purchase,
    presentedTokenHash: token ? hashAccessToken(token) : null,
    loadViewer: getCurrentUserProfile,
    getViewerUserId: (profile) => profile.id,
  });

  // A refusal renders the same 404 as a missing purchase, so probing for real
  // purchase ids tells an attacker nothing.
  if (!access.granted) notFound();

  const tickets = await Promise.all(
    purchase.lines.map(async (line) => ({
      line,
      qrDataUrl:
        line.ticket && line.ticket.status === "valid"
          ? await generateQrDataUrl(line.ticket.code)
          : null,
    })),
  );

  // Shared with the action and the upload endpoint, so the status list lives in
  // one place. Terminal states get no card; the status line above already says
  // what happened.
  const showPaymentStep = acceptsVouchers(purchase);

  /**
   * Same source the store and stand reservations use: the QR matching this
   * exact amount, else the zero-amount code the payer fills in themselves.
   */
  const qrCode = showPaymentStep
    ? await getQrCodeForAmount(purchase.totalAmount)
    : null;

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      {/* No token in the properties: the URL carries a credential and PostHog
          would store it. Only how the viewer got here. */}
      <ProgramViewTracker
        event={POSTHOG_EVENTS.PROGRAM_PURCHASE_VIEWED}
        properties={{
          purchase_id: purchase.id,
          program_slug: purchase.program.slug,
          purchase_status: purchase.status,
          payment_mode: purchase.paymentMode,
          total_amount: purchase.totalAmount,
          access_via: access.via,
          awaiting_voucher: showPaymentStep,
        }}
      />
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Tu inscripción</h1>
        <p className="text-sm text-muted-foreground">
          {purchase.program.name} ·{" "}
          {SESSION_PURCHASE_STATUS_LABELS[purchase.status]}
        </p>
      </header>

      {showPaymentStep ? (
        <VoucherUploadCard
          purchaseId={purchase.id}
          token={access.via === "token" && token ? token : undefined}
          totalAmount={purchase.totalAmount}
          bankQrImageUrl={qrCode?.qrCodeUrl ?? null}
          // A zero-amount code needs the payer to type the total in; an
          // amount-specific one does not. Saying which avoids a wrong transfer.
          qrCoversAmount={
            qrCode ? qrCode.amount === purchase.totalAmount : false
          }
          // Only meaningful before a voucher exists: once under review the seat
          // is held by the review, not the clock.
          holdExpiresAt={
            purchase.status === "pending_upload" ? purchase.holdExpiresAt : null
          }
          vouchers={purchase.vouchers}
          changesRequested={purchase.status === "changes_requested"}
        />
      ) : null}

      <div className="space-y-4">
        {tickets.map(({ line, qrDataUrl }) =>
          line.ticket ? (
            <PurchaseTicketCard
              key={line.id}
              sessionTitle={line.session.title}
              sessionType={line.session.type}
              startsAt={line.occurrence.startsAt}
              endsAt={line.occurrence.endsAt}
              venueName={line.occurrence.venue?.name ?? null}
              room={line.occurrence.room}
              ticketCode={line.ticket.code}
              ticketStatus={line.ticket.status}
              qrDataUrl={qrDataUrl}
            />
          ) : null,
        )}
      </div>

      {/* Only shown to someone who arrived by token — the owner reaches this
          from their profile and does not need a link to save. */}
      {access.via === "token" && token ? (
        <SecureLinkNotice url={buildSecureLinkUrl(purchase.id, token)} />
      ) : null}

      {/* Future tense on purpose: self-service cancellation is not built yet
          (Phase 5). Promising a button that does not exist is worse than
          saying when it will. The refund clause only applies to paid
          purchases — on a free one there is nothing to refund. */}
      <p className="text-xs text-muted-foreground">
        Podrás cancelar tu inscripción hasta dos días antes de la sesión;
        habilitaremos esa opción en esta página próximamente.
        {purchase.paymentMode === "bank_qr"
          ? " La cancelación no genera reembolso."
          : ""}
      </p>
    </div>
  );
}
