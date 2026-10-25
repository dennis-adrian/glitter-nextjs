import type { Metadata } from "next";
import { redirect } from "next/navigation";

import HubSchedule from "@/app/components/participations/hub/hub-schedule";
import { HubSubpage } from "@/app/components/participations/hub/hub-section";
import { hubSectionAvailability } from "@/app/components/participations/hub/hub-shortcuts";
import { loadParticipationHub } from "@/app/lib/participations/hub";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Horarios",
};

/** One of the hub's sections on its own screen, opened from its shortcut. */
export default async function Page() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind !== "hub" || !hubSectionAvailability(hub).schedule) {
    redirect("/my_participations");
  }

  return (
    <HubSubpage title="Horarios" festivalName={hub.festival.name}>
      <HubSchedule festivalDates={hub.festival.festivalDates} />
    </HubSubpage>
  );
}
