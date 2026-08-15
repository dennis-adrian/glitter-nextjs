import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassDateOfferingCard from "@/app/components/fast-pass/public/date-offering-card";
import FastPassDiscoveryHero from "@/app/components/fast-pass/public/discovery-hero";
import { requireFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { fetchFastPassPublicOffering } from "@/app/lib/fast-pass/inventory-queries";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Pase Rápido",
  description: "Acceso prioritario para tu día de festival",
};

export default async function FastPassDiscoveryPage(props: {
  params: Promise<{ id: string }>;
}) {
  await requireFeatureEnabled("fast_pass");

  const params = await props.params;
  const festivalId = parseInt(params.id, 10);
  if (!Number.isFinite(festivalId)) notFound();

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  const dates = await fetchFastPassPublicOffering(festivalId);

  return (
    <div className="container mx-auto max-w-4xl space-y-8 px-4 py-8">
      <p className="text-sm text-muted-foreground">{festival.name}</p>
      <FastPassDiscoveryHero />
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Elegí tu día</h2>
        <FastPassDateOfferingCard festivalId={festivalId} dates={dates} />
      </section>
    </div>
  );
}
