import type { Metadata } from "next";
import { redirect } from "next/navigation";

import PurchaseReviewCard from "@/app/components/dashboard/programs/purchase-review-card";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchPurchasesAwaitingReview } from "@/app/lib/programs/purchase-queries";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

export const metadata: Metadata = {
  title: "Pagos por revisar",
};

export default async function PurchaseReviewQueuePage() {
  await requireFeatureEnabled("paid_programs");

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) redirect("/");

  const purchases = await fetchPurchasesAwaitingReview();

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Pagos por revisar</h1>
        <p className="text-sm text-muted-foreground">
          {purchases.length === 0
            ? "No hay comprobantes esperando revisión."
            : `${purchases.length} comprobante(s) esperando revisión, del más antiguo al más reciente.`}
        </p>
      </header>

      <div className="space-y-4">
        {purchases.map((purchase) => (
          <PurchaseReviewCard
            key={purchase.id}
            purchaseId={purchase.id}
            // A guest carries their own details; a signed-in buyer's live on
            // their profile, and the identity check guarantees exactly one of
            // the two is populated.
            buyerName={
              purchase.guestName ??
              purchase.buyer?.displayName ??
              purchase.buyer?.email ??
              "Comprador"
            }
            buyerEmail={purchase.guestEmail ?? purchase.buyer?.email ?? ""}
            buyerPhone={
              purchase.guestPhone ?? purchase.buyer?.phoneNumber ?? null
            }
            isActiveParticipant={
              purchase.buyerEligibility === "active_participant"
            }
            totalAmount={purchase.totalAmount}
            status={
              purchase.status as "under_verification" | "changes_requested"
            }
            submittedAt={purchase.voucherSubmittedAt}
            lines={purchase.lines.map((line) => ({
              id: line.id,
              sessionTitle: line.sessionTitleSnapshot,
              startsAt: line.occurrenceStartsAtSnapshot,
            }))}
            vouchers={purchase.vouchers}
          />
        ))}
      </div>
    </div>
  );
}
