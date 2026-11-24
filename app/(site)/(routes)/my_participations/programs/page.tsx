import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HubPrograms from "@/app/components/participations/hub/hub-programs";
import { HubSubpage } from "@/app/components/participations/hub/hub-section";
import { hubSectionAvailability } from "@/app/components/participations/hub/hub-shortcuts";
import { loadParticipationHub } from "@/app/lib/participations/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Charlas y talleres",
};

/** One of the hub's sections on its own screen, opened from its shortcut. */
export default async function Page() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind !== "hub" || !hubSectionAvailability(hub).programs) {
    redirect("/my_participations");
  }

  return (
    <HubSubpage title="Charlas y talleres" festivalName={hub.festival.name}>
      <HubPrograms sessions={hub.sessions} />
    </HubSubpage>
  );
}
