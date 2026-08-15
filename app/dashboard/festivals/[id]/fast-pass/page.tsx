import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassOverviewDateCard from "@/app/components/fast-pass/admin/overview-date-card";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassInventoryOverview } from "@/app/lib/fast-pass/inventory-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Pase Rápido — Resumen",
};

export default async function FastPassOverviewPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  const dates = await fetchFastPassInventoryOverview(festivalId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Resumen por día</h2>
        <p className="text-sm text-muted-foreground">
          {festival.name} · estado de oferta, precio e inventario restante
        </p>
      </header>

      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Este festival no tiene fechas configuradas.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {dates.map((date) => (
            <FastPassOverviewDateCard key={date.festivalDateId} date={date} />
          ))}
        </div>
      )}
    </div>
  );
}
