import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassPosOperatorsManager from "@/app/components/fast-pass/admin/pos-operators-manager";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassDaySettingsBundle } from "@/app/lib/fast-pass/inventory-queries";
import { fetchFastPassPosOperators } from "@/app/lib/fast-pass/purchase-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Pase Rápido — Operadores POS",
};

export default async function FastPassOperatorsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  // The query does not order dates, so sort for a chronological day selector.
  const dates = await Promise.all(
    [...festival.festivalDates]
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
      .map(async (date) => {
        const bundle = await fetchFastPassDaySettingsBundle(date.id);
        return {
          festivalDateId: date.id,
          settingsId: bundle?.settings.id ?? null,
          startDate: date.startDate,
        };
      }),
  );

  const operators = await fetchFastPassPosOperators(festivalId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Operadores POS</h2>
        <p className="text-sm text-muted-foreground">
          Crea y revoca credenciales para ventas en sitio.
        </p>
      </header>
      <FastPassPosOperatorsManager dates={dates} operators={operators} />
    </div>
  );
}
