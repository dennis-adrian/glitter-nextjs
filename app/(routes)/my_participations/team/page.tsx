import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HubTeam from "@/app/components/participations/hub/hub-team";
import { HubSubpage } from "@/app/components/participations/hub/hub-section";
import { hubSectionAvailability } from "@/app/components/participations/hub/hub-shortcuts";
import { loadParticipationHub } from "@/app/lib/participations/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Equipo",
};

/** One of the hub's sections on its own screen, opened from its shortcut. */
export default async function Page() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind !== "hub" || !hubSectionAvailability(hub).team) {
    redirect("/my_participations");
  }

  return (
    <HubSubpage title="Equipo" festivalName={hub.festival.name}>
      <HubTeam reservation={hub.reservation!} />
    </HubSubpage>
  );
}
