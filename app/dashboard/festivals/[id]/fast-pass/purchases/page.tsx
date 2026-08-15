import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassPurchaseReviewCard from "@/app/components/fast-pass/admin/purchase-review-card";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassPurchasesAwaitingReview } from "@/app/lib/fast-pass/purchase-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";

export const metadata: Metadata = {
  title: "Pase Rápido — Compras",
};

export default async function FastPassPurchasesPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const purchases = await fetchFastPassPurchasesAwaitingReview(festivalId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Compras por revisar</h2>
        <p className="text-sm text-muted-foreground">
          {purchases.length === 0
            ? "No hay comprobantes esperando revisión."
            : `${purchases.length} comprobante(s), del más antiguo al más reciente.`}
        </p>
      </header>

      <div className="space-y-4">
        {purchases.map((purchase) => (
          <FastPassPurchaseReviewCard
            key={purchase.id}
            purchaseId={purchase.id}
            buyerName={purchase.buyerName}
            buyerEmail={purchase.buyerEmail}
            buyerPhone={purchase.buyerPhone}
            festivalDateLabel={purchase.festivalDateLabel}
            totalAmount={purchase.totalAmount}
            status={purchase.status}
            submittedAt={purchase.voucherSubmittedAt}
            paidPassCount={purchase.paidPassCount}
            childCount={purchase.childCount}
            vouchers={purchase.vouchers}
          />
        ))}
      </div>
    </div>
  );
}
