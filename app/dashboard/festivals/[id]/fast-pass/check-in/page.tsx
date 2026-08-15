import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassCheckInForm from "@/app/components/fast-pass/check-in/check-in-form";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";
import { fetchFestivalWithDates } from "@/app/lib/festivals/actions";

export const metadata: Metadata = {
  title: "Pase Rápido — Check-in",
};

export default async function FastPassCheckInPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const festival = await fetchFestivalWithDates(festivalId);
  if (!festival) notFound();

  const dates = [...festival.festivalDates]
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())
    .map((date) => ({
      festivalDateId: date.id,
      startDate: date.startDate,
    }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Check-in Pase Rápido</h2>
        <p className="text-sm text-muted-foreground">
          Validación de QR y emisión de pulsera en el acceso prioritario.
        </p>
      </header>
      <FastPassCheckInForm dates={dates} />
    </div>
  );
}
