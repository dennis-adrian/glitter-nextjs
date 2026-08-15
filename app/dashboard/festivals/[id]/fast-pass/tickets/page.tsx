import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FastPassTicketsTable from "@/app/components/fast-pass/admin/tickets-table";
import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";
import { fetchFastPassTickets } from "@/app/lib/fast-pass/purchase-queries";
import { parseRouteId } from "@/app/lib/fast-pass/route-params";

export const metadata: Metadata = {
  title: "Pase Rápido — Tickets",
};

export default async function FastPassTicketsPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const festivalId = parseRouteId(params.id);
  if (festivalId === null) notFound();

  const admin = await requireFastPassFestivalAdmin(festivalId);
  if (!admin) notFound();

  const tickets = await fetchFastPassTickets(festivalId);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">Tickets y activaciones</h2>
        <p className="text-sm text-muted-foreground">
          Tickets emitidos y su estado de activación por día de festival.
        </p>
      </header>
      <FastPassTicketsTable tickets={tickets} />
    </div>
  );
}
