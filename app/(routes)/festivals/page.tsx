import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import PastFestivalsList from "@/app/components/festivals/past-festivals-list";
import {
  HubPanel,
  HubSection,
} from "@/app/components/participations/hub/hub-section";
import { fetchActiveFestivalBase } from "@/app/lib/festivals/actions";
import { fetchPastFestivals } from "@/app/lib/festivals/queries";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Festivales",
  description: "Los festivales de la Productora Glitter, en curso y anteriores.",
};

/**
 * The "Festivales" tab of anyone without a participant's hub: the festival in
 * progress, on its public page, or the festivals that already happened when
 * none is.
 */
export default async function FestivalsPage() {
  const active = await fetchActiveFestivalBase();
  if (active) redirect(`/festivals/${active.id}`);

  const past = await fetchPastFestivals();

  return (
    <div className="container flex max-w-5xl flex-col gap-5 p-4 md:p-6">
      <Heading>Festivales</Heading>
      <HubPanel className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold text-brand-ink">
          No hay un festival en curso
        </h2>
        <p className="text-sm text-brand-neutral">
          Mientras tanto, mirá las ediciones anteriores: sus participantes y
          actividades siguen publicados.
        </p>
      </HubPanel>
      <HubSection title="Festivales anteriores">
        <PastFestivalsList festivals={past} />
      </HubSection>
    </div>
  );
}
