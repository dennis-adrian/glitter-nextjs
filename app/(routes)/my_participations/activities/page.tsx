import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HubActivities from "@/app/components/participations/hub/hub-activities";
import { HubSubpage } from "@/app/components/participations/hub/hub-section";
import { hubSectionAvailability } from "@/app/components/participations/hub/hub-shortcuts";
import { loadParticipationHub } from "@/app/lib/participations/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Actividades",
};

/** One of the hub's sections on its own screen, opened from its shortcut. */
export default async function Page() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind !== "hub" || !hubSectionAvailability(hub).activities) {
    redirect("/my_participations");
  }

  return (
    <HubSubpage title="Actividades" festivalName={hub.festival.name}>
      <HubActivities activities={hub.activities} profile={hub.profile} />
    </HubSubpage>
  );
}
