import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassRefundsQueue from "@/app/components/fast-pass/admin/refunds-queue";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassPendingRefunds } from "@/app/lib/fast-pass/purchase-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";

export const metadata: Metadata = {
  title: "Pase Rápido — Reembolsos",
};

export default async function FastPassRefundsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const refunds = await fetchFastPassPendingRefunds(festivalId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Cola de reembolsos</h2>
        <p className="text-sm text-muted-foreground">
          Reembolsos generados por cancelación del festival.
        </p>
      </header>
      <FastPassRefundsQueue refunds={refunds} />
    </div>
  );
}
