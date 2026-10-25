import type { Metadata } from "next";
import { redirect } from "next/navigation";

import Heading from "@/app/components/atoms/heading";
import ParticipationHistoryPreview from "@/app/components/participant_dashboard/participation-history-preview";
import HubActivities from "@/app/components/participations/hub/hub-activities";
import HubHero from "@/app/components/participations/hub/hub-hero";
import HubPendingList from "@/app/components/participations/hub/hub-pending-list";
import HubPrograms from "@/app/components/participations/hub/hub-programs";
import HubQuickAccess from "@/app/components/participations/hub/hub-quick-access";
import HubSchedule from "@/app/components/participations/hub/hub-schedule";
import {
  HubPanel,
  HubSection,
} from "@/app/components/participations/hub/hub-section";
import {
  buildHubShortcuts,
  hubSectionAvailability,
} from "@/app/components/participations/hub/hub-shortcuts";
import HubTeam from "@/app/components/participations/hub/hub-team";
import ParticipationStatusCard from "@/app/components/participations/hub/participation-status-card";
import { loadParticipationHub } from "@/app/lib/participations/hub";
import type { HubStatus } from "@/app/lib/participations/hub-status";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Participaciones",
};

function eyebrowFor(status: HubStatus) {
  if (status === "pending_enrollment") return "Inscripciones abiertas";
  if (status === "approved_enrollment") return "Reservas abiertas";
  return "En curso";
}

/**
 * Everything about the participant's place in the active festival, in one
 * page: the festival, the participation's state and next step, what is still
 * pending, and — once the stand is confirmed — the team, the schedule and the
 * activities. Phones open the long sections on their own screens; desktops
 * show them here.
 */
export default async function ParticipationsPage() {
  const hub = await loadParticipationHub();

  if (hub.kind === "signed-out") redirect("/sign_in");
  if (hub.kind === "not-verified") redirect("/next_event");

  if (hub.kind === "no-festival") {
    return (
      <div className="container flex max-w-3xl flex-col gap-5 p-4 md:p-6">
        <Heading>Participaciones</Heading>
        <HubPanel className="flex flex-col gap-1">
          <h2 className="font-display text-lg font-bold text-brand-ink">
            No hay un festival en curso
          </h2>
          <p className="text-sm text-brand-neutral">
            Te avisamos cuando se abran las inscripciones de la próxima edición.
          </p>
        </HubPanel>
        <ParticipationHistoryPreview profile={hub.profile} />
      </div>
    );
  }

  const available = hubSectionAvailability(hub);
  const pendingCount = hub.pending.filter((item) => !item.done).length;
  const pendingTitle =
    pendingCount > 0 ? `Pendientes (${pendingCount})` : "Pendientes";

  return (
    <div className="container flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <Heading className="lg:sr-only">Participaciones</Heading>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-5">
          <HubHero
            festival={hub.festival}
            mapHref={hub.links.map}
            eyebrow={eyebrowFor(hub.status)}
          />
          <ParticipationStatusCard hub={hub} />

          <HubQuickAccess
            shortcuts={buildHubShortcuts(hub)}
            className="lg:hidden"
          />

          {hub.pending.length > 0 ? (
            <HubSection title={pendingTitle} className="lg:hidden">
              <HubPendingList items={hub.pending} />
            </HubSection>
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

        <aside className="hidden flex-col gap-5 lg:flex">
          {hub.pending.length > 0 ? (
            <HubSection title={pendingTitle}>
              <HubPendingList items={hub.pending} />
            </HubSection>
          ) : null}
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
      </div>
    </div>
  );
}
