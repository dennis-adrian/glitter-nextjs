import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import EnrollmentActions from "@/app/components/dashboard/programs/enrollment/enrollment-actions";
import EnrollmentEventHistory from "@/app/components/dashboard/programs/enrollment/enrollment-event-history";
import EnrollmentHeader from "@/app/components/dashboard/programs/enrollment/enrollment-header";
import EnrollmentLines from "@/app/components/dashboard/programs/enrollment/enrollment-lines";
import EnrollmentVouchers from "@/app/components/dashboard/programs/enrollment/enrollment-vouchers";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchPurchaseForAdmin } from "@/app/lib/programs/purchase-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Inscripción",
};

type Props = {
  params: Promise<{ purchaseId: string }>;
};

/** Display name for the audit trail's actor column. */
function actorName(
  actor: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null,
): string | null {
  if (!actor) return null;
  const full = [actor.firstName, actor.lastName].filter(Boolean).join(" ");
  return actor.displayName || full || actor.email;
}

/**
 * One enrollment, with every admin action it currently allows.
 *
 * This is the counterpart to the review queue: that page answers "what needs a
 * decision", filtered to bank-QR purchases awaiting one. Support needs the
 * other question — "show me this enrollment" — for approved seats, free
 * registrations, and closed purchases, none of which the queue lists.
 */
export default async function EnrollmentDetailPage({ params }: Props) {
  await requireFeatureEnabled("paid_programs");

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) redirect("/dashboard");

  const { purchaseId: rawId } = await params;
  const purchaseId = Number(rawId);
  if (!Number.isInteger(purchaseId) || purchaseId < 1) notFound();

  const purchase = await fetchPurchaseForAdmin(purchaseId);
  if (!purchase) notFound();

  const isGuest = purchase.userId === null;
  const buyerEmail = purchase.guestEmail ?? purchase.buyer?.email ?? "";

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-3 md:p-6">
      <Link
        href="/dashboard/programs/purchases"
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        ← Pagos por revisar
      </Link>

      <EnrollmentHeader
        buyerName={
          purchase.guestName ??
          purchase.buyer?.displayName ??
          purchase.buyer?.email ??
          "Comprador"
        }
        buyerEmail={buyerEmail}
        buyerPhone={purchase.guestPhone ?? purchase.buyer?.phoneNumber ?? null}
        isGuest={isGuest}
        isActiveParticipant={purchase.buyerEligibility === "active_participant"}
        status={purchase.status}
        paymentMode={purchase.paymentMode}
        totalAmount={purchase.totalAmount}
        createdAt={purchase.createdAt}
        promo={
          purchase.promoRedemption
            ? {
                code: purchase.promoRedemption.codeSnapshot,
                partnerName: purchase.promoRedemption.partnerNameSnapshot,
                discountPercent:
                  purchase.promoRedemption.discountPercentSnapshot,
                discountAmount: purchase.promoRedemption.discountAmountSnapshot,
              }
            : null
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesiones y entradas</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentLines
            lines={purchase.lines.map((line) => ({
              id: line.id,
              occurrenceId: line.occurrenceId,
              sessionTitle: line.sessionTitleSnapshot,
              startsAt: line.occurrenceStartsAtSnapshot,
              venueName: line.occurrence?.venue?.name ?? null,
              room: line.occurrence?.room ?? null,
              unitPrice: line.unitPrice,
              ticket: line.ticket
                ? {
                    code: line.ticket.code,
                    status: line.ticket.status,
                    checkedInAt: line.ticket.attendance?.checkedInAt ?? null,
                  }
                : null,
            }))}
          />
        </CardContent>
      </Card>

      {/* A free registration never has one, and an empty panel would read as a
          missing document rather than an inapplicable one. */}
      {purchase.paymentMode === "bank_qr" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comprobante</CardTitle>
          </CardHeader>
          <CardContent>
            <EnrollmentVouchers vouchers={purchase.vouchers} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Acciones</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentActions
            purchaseId={purchase.id}
            status={purchase.status}
            paymentMode={purchase.paymentMode}
            voucherCount={purchase.vouchers.length}
            hasRecipient={buyerEmail.length > 0}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentEventHistory
            events={purchase.events.map((event) => ({
              id: event.id,
              eventType: event.eventType,
              actorType: event.actorType,
              actorName: actorName(event.actor ?? null),
              reason: event.reason,
              createdAt: event.createdAt,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
