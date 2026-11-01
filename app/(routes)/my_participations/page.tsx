import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import HubActivities from "@/app/components/participations/hub/hub-activities";
import HubHero from "@/app/components/participations/hub/hub-hero";
import HubPrograms from "@/app/components/participations/hub/hub-programs";
import HubQuickAccess from "@/app/components/participations/hub/hub-quick-access";
import HubSchedule from "@/app/components/participations/hub/hub-schedule";
import { HubSection } from "@/app/components/participations/hub/hub-section";
import {
  buildDesktopShortcuts,
  buildHubShortcuts,
  hubSectionAvailability,
} from "@/app/components/participations/hub/hub-shortcuts";
import HubTeam from "@/app/components/participations/hub/hub-team";
import ParticipationStatusCard from "@/app/components/participations/hub/participation-status-card";
import { loadParticipationHub } from "@/app/lib/participations/hub";
import { isParticipationEnded } from "@/app/lib/participations/hub-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Participaciones",
};

/**
 * Everything about the participant's place in the active festival, in one
 * page: the festival, where the participation stands and its one next step,
 * and the shortcuts. What is still pending is counted on the card and listed
 * on Inicio, so it is not repeated here. Phones open the long sections on
 * their own screens; desktops show the team and the activities on the page,
 * and the schedule and the talks in the right column.
 */
export default async function ParticipationsPage() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind === "not-verified") redirect("/festivals");

  // Between editions the hub is the history: nothing to announce, so nothing
  // is announced.
  if (hub.kind === "no-festival") {
    return (
      <div className="container flex max-w-3xl flex-col gap-5 p-4 md:p-6">
        <Heading>Participaciones</Heading>
        <ParticipationHistoryPreview profile={hub.profile} />
      </div>
    );
  }

  const available = hubSectionAvailability(hub);
  const ended = isParticipationEnded(hub.status);
  const desktopShortcuts = buildDesktopShortcuts(hub);

  return (
    <div className="container flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <Heading className="lg:sr-only">Participaciones</Heading>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          <HubHero festival={hub.festival} mapHref={hub.links.map} />
          <ParticipationStatusCard hub={hub} />

          <HubQuickAccess
            shortcuts={buildHubShortcuts(hub)}
            className="lg:hidden"
          />
          {desktopShortcuts.length > 0 ? (
            <HubQuickAccess
              shortcuts={desktopShortcuts}
              className="hidden lg:block"
            />
          ) : null}

          {available.team && hub.reservation ? (
            <HubSection title="Equipo" className="hidden lg:flex">
              <HubTeam reservation={hub.reservation} />
            </HubSection>
          ) : null}

          {available.activities ? (
            <HubSection title="Actividades" className="hidden lg:flex">
              <HubActivities
                activities={hub.activities}
                profile={hub.profile}
                columns={2}
              />
            </HubSection>
          ) : null}

          <ParticipationHistoryPreview
            profile={hub.profile}
            activeFestivalId={hub.festival.id}
          />
        </div>

        {/* A participation that has ended has no schedule to keep. */}
        {ended ? null : (
          <aside className="hidden flex-col gap-5 lg:flex">
            {available.schedule ? (
              <HubSection title="Horarios para participantes">
                <HubSchedule festivalDates={hub.festival.festivalDates} />
              </HubSection>
            ) : null}
            {available.programs ? (
              <HubSection title="Charlas y talleres del festival">
                <HubPrograms sessions={hub.sessions} />
              </HubSection>
            ) : null}
          </aside>
        )}
      </div>
    </div>
  );
}
