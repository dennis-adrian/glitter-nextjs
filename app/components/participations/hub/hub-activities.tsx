import type { BaseProfile } from "@/app/api/users/definitions";
import FestivalActivityCard from "@/app/components/participant_dashboard/activity-card/card";
import { getEnrollmentInfo } from "@/app/components/participant_dashboard/activity-card/utils";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import { cn } from "@/app/lib/utils";

/**
 * The festival's activities, the participant's own enrollments first. Each
 * card carries its own state and action (enroll, upload a proof, vote), so the
 * list only decides the order.
 */
export default function HubActivities({
  activities,
  profile,
  columns = 1,
  votesReceived = {},
}: {
  activities: FestivalActivityWithDetailsAndParticipants[];
  profile: BaseProfile;
  columns?: 1 | 2;
  /** Per activity id, once its voting closed. */
  votesReceived?: Record<number, number>;
}) {
  if (activities.length === 0) {
    return (
      <p className="rounded-2xl border border-brand-border bg-brand-card p-4 text-sm text-brand-neutral">
        Este festival todavía no tiene actividades.
      </p>
    );
  }

  const enrolled = activities.filter(
    (activity) => getEnrollmentInfo(activity, profile.id).isEnrolled,
  );
  const others = activities.filter(
    (activity) => !getEnrollmentInfo(activity, profile.id).isEnrolled,
  );
  const grid = cn("grid gap-3", columns === 2 && "md:grid-cols-2");

  return (
    <div className="flex flex-col gap-5">
      {enrolled.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-brand-neutral">
            Tus inscripciones
          </h3>
          <div className={grid}>
            {enrolled.map((activity) => {
              const votes = votesReceived[activity.id];
              return (
                <div key={activity.id} className="flex flex-col gap-1.5">
                  <FestivalActivityCard
                    activity={activity}
                    forProfile={profile}
                  />
                  {votes != null ? (
                    <p className="px-1 text-sm font-semibold text-brand-ink">
                      {votes === 0
                        ? "No recibiste votos"
                        : votes === 1
                          ? "Recibiste 1 voto"
                          : `Recibiste ${votes} votos`}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      {others.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-brand-neutral">
            {enrolled.length > 0 ? "Más actividades" : "Del festival"}
          </h3>
          <div className={grid}>
            {others.map((activity) => (
              <FestivalActivityCard
                key={activity.id}
                activity={activity}
                forProfile={profile}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
