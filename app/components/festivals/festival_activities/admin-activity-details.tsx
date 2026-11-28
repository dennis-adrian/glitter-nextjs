import Link from "next/link";
import { PencilIcon, ClipboardListIcon, TrophyIcon } from "lucide-react";

import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { getMaterialConfig } from "@/app/lib/festival_activites/helpers";
import ActivityParticipantsTable from "./activity-participants-table";
import ActivityVisibilityButton from "./activity-visibility-button";
import ActivityWaitlistTable from "./activity-waitlist-table";
import type { MoveTargetVariant } from "./move-participant-variant-menu";

type ActivityDetailsProps = {
  activity: FestivalActivityWithDetailsAndParticipants;
};

export default function ActivityDetails({ activity }: ActivityDetailsProps) {
  // Removed participants stay listed (with their badge) but hold no slot, so
  // the counts leave them out, as the Mover menu and the server do.
  const activeCountOf = (detail: (typeof activity.details)[number]) =>
    detail.participants.filter((p) => p.removedAt == null).length;
  // The waitlist table starts from this instant so hydration matches.
  const now = new Date();
  // Only invitations still open on the server's clock: a device clock running
  // behind would otherwise count lapsed ones again. The Mover menu drops the
  // rest as they lapse, by the time it opens.
  const reservationExpiriesOf = (detailId: number) =>
    activity.waitlistEntries.flatMap((entry) =>
      entry.notifiedForDetailId === detailId &&
      entry.expiresAt != null &&
      new Date(entry.expiresAt) > now
        ? [new Date(entry.expiresAt).getTime()]
        : [],
    );
  const totalParticipants = activity.details.reduce(
    (sum, d) => sum + activeCountOf(d),
    0,
  );
  const showVariantHeaders = activity.details.length > 1;
  const { label: materialLabel } = getMaterialConfig(activity.type);
  const variantLabel = (index: number, description: string | null) =>
    `Variante ${index + 1}${description ? ` — ${description}` : ""}`;
  const moveTargets: MoveTargetVariant[] = activity.details.map(
    (detail, index) => ({
      id: detail.id,
      label: variantLabel(index, detail.description),
      activeCount: activeCountOf(detail),
      reservationExpiries: reservationExpiriesOf(detail.id),
      participationLimit: detail.participationLimit,
      category: detail.category,
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-muted-foreground">
          {totalParticipants} participante
          {totalParticipants !== 1 ? "s" : ""}
        </h2>
        <div className="flex flex-wrap gap-2">
          <ActivityVisibilityButton
            activityId={activity.id}
            festivalId={activity.festivalId}
            isVisible={activity.isVisible}
          />
          <Button asChild variant="outline" size="sm">
            <Link
              href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/edit`}
            >
              <PencilIcon className="w-4 h-4 mr-1" />
              Editar
            </Link>
          </Button>
          <RedirectButton
            href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/review`}
            size="sm"
          >
            <ClipboardListIcon className="w-4 h-4 mr-1" />
            Iniciar revisión
          </RedirectButton>
          {activity.allowsVoting && (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/dashboard/festivals/${activity.festivalId}/festival_activities/${activity.id}/results`}
              >
                <TrophyIcon className="w-4 h-4 mr-1" />
                Ver resultados
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {activity.details.map((detail, index) => {
          const participants = detail.participants.map((p) => ({
            ...p,
            detail,
          }));
          const activeCount = activeCountOf(detail);
          const limitLabel = detail.participationLimit
            ? `${activeCount}/${detail.participationLimit}`
            : `${activeCount}`;

          return (
            <div key={detail.id} className="flex flex-col gap-2">
              {showVariantHeaders && (
                <h3 className="text-sm font-medium text-muted-foreground break-words">
                  {variantLabel(index, detail.description)} · {limitLabel}{" "}
                  participante
                  {activeCount !== 1 ? "s" : ""}
                </h3>
              )}
              <ActivityParticipantsTable
                activityId={activity.id}
                detailId={detail.id}
                label={variantLabel(index, detail.description)}
                participants={participants}
                materialLabel={materialLabel}
                variants={moveTargets}
              />
            </div>
          );
        })}
      </div>

      {activity.waitlistWindowMinutes !== null &&
        activity.waitlistEntries.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="text-base font-semibold text-muted-foreground">
              Lista de espera ({activity.waitlistEntries.length})
            </h2>
            <ActivityWaitlistTable
              entries={activity.waitlistEntries}
              festivalId={activity.festivalId}
              renderedAt={now}
            />
          </div>
        )}
    </div>
  );
}
