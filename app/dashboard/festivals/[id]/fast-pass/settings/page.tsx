import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassDaySettingsForm from "@/app/components/fast-pass/admin/day-settings-form";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassDaySettingsBundle } from "@/app/lib/fast-pass/inventory-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Pase Rápido — Configuración",
};

export default async function FastPassSettingsPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dateId?: string }>;
}) {
  const [params, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  // The query does not order dates, so sort before dates[0] becomes the default.
  const dates = [...festival.festivalDates]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((date) => ({
      festivalDateId: date.id,
      startDate: date.startDate,
    }));

  const parsedDateId = searchParams.dateId
    ? parseInt(searchParams.dateId, 10)
    : (dates[0]?.festivalDateId ?? null);

  const selectedDateId =
    parsedDateId && dates.some((date) => date.festivalDateId === parsedDateId)
      ? parsedDateId
      : (dates[0]?.festivalDateId ?? null);

  const initialBundle = selectedDateId
    ? await fetchFastPassDaySettingsBundle(selectedDateId)
    : null;

  return (
    <FastPassDaySettingsForm
      festivalId={festivalId}
      dates={dates}
      initialDateId={selectedDateId}
      initialBundle={initialBundle}
    />
  );
}
