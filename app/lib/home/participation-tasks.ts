import {
  getEnrolledConfig,
  getEnrollmentInfo,
} from "@/app/components/participant_dashboard/activity-card/utils";
import {
  activityTasks,
  festivalTasks,
  type ActivityProofTask,
  type HomeTask,
} from "@/app/lib/home/tasks";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";

const ACTIVITIES_HREF = "/my_participations/activities";

/** What the activities still need from this participant, as their cards say it. */
function pendingActivityProofs(hub: ParticipationHub): ActivityProofTask[] {
  const tasks: ActivityProofTask[] = [];
  for (const activity of hub.activities) {
    const info = getEnrollmentInfo(activity, hub.profile.id);
    if (!info.isEnrolled || info.isRemoved) continue;
    const config = getEnrolledConfig(
      activity,
      hub.profile.id,
      info.proofDisplayState,
    );
    if (!config.isPending || config.isUploadExpired) continue;
    tasks.push({
      activityId: activity.id,
      activityName: activity.name,
      pendingLabel: config.pendingLabel,
      deadline: config.deadlineDate,
    });
  }
  return tasks;
}

/**
 * The participation's own open tasks: its steps with somewhere to go, then
 * what the activities still need. Inicio lists them with everything else; the
 * hub's card counts them, so both always agree.
 */
export function participationTasks(
  hub: ParticipationHub,
  { invoiceDueAt = null }: { invoiceDueAt?: Date | null } = {},
): HomeTask[] {
  return [
    ...festivalTasks(hub.pending, {
      standLabel: hub.reservation
        ? `stand ${reservationStandLabel(hub.reservation)}`
        : null,
      invoiceDueAt,
    }),
    ...activityTasks(pendingActivityProofs(hub), ACTIVITIES_HREF),
  ];
}
