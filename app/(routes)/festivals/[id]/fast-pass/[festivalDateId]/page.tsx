import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassCheckoutForm from "@/app/components/fast-pass/public/checkout-form";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFastPassCheckoutContext } from "@/app/lib/fast-pass/inventory-queries";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";
import { formatFullDate } from "@/app/lib/formatters";

export const metadata: Metadata = {
  title: "Comprar Pase Rápido",
  robots: { index: false, follow: false },
};

export default async function FastPassCheckoutPage(props: {
  params: Promise<{ id: string; festivalDateId: string }>;
}) {
  await requireFeatureEnabled("fast_pass");

  const params = await props.params;
  const festivalId = parseInt(params.id, 10);
  const festivalDateId = parseInt(params.festivalDateId, 10);
  if (!Number.isFinite(festivalId) || !Number.isFinite(festivalDateId)) {
    notFound();
  }

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  const festivalDate = festival.festivalDates.find(
    (date) => date.id === festivalDateId,
  );
  if (!festivalDate) notFound();

  const context = await fetchFastPassCheckoutContext(festivalDateId);
  if (!context || context.saleState !== "on_sale") notFound();

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <FastPassCheckoutForm
        festivalDateId={festivalDateId}
        festivalDateLabel={formatFullDate(festivalDate.startDate)}
        price={context.price}
        maxPaidPasses={context.maxPaidPassesPerPurchase}
        remainingPaid={context.remainingPaid}
      />
    </div>
  );
}
