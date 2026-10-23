import "server-only";

import type { InfractionEmailKind } from "@/app/emails/infraction-lifecycle";
import type { SanctionEmailKind } from "@/app/emails/sanction-lifecycle";
import type { DisciplinaryNotificationPayload } from "@/app/lib/infractions/notifications";
import {
  mirrorFailureType,
  type MirrorNotification,
} from "@/app/lib/notifications/mirrors/shared";
import { notify } from "@/app/lib/notifications/notify";
import type { NotificationKind } from "@/app/lib/notifications/registry";
import { db } from "@/db";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The inbox half of the disciplinary outbox (phase 2): each notice it queues
 * gets an in-app copy, from the participant-safe snapshot the email renders.
 */

const INFRACTION_KINDS = {
  registered: "infraction_registered",
  edited: "infraction_edited",
  resolved: "infraction_resolved",
  voided: "infraction_voided",
} as const satisfies Record<InfractionEmailKind, NotificationKind>;

const SANCTION_KINDS = {
  approved: "sanction_approved",
  edited: "sanction_edited",
  expired: "sanction_expired",
  revoked: "sanction_revoked",
  reservation_access_enabled: "sanction_reservation_access_enabled",
} as const satisfies Record<SanctionEmailKind, NotificationKind>;

export type DisciplinaryJobToMirror = {
  /** The outbox job's key: one per event and person, never an address. */
  deduplicationKey: string;
  userId: number;
  payload: DisciplinaryNotificationPayload;
  /** The festival reservation access opened for, to link to its map. */
  festivalId?: number | null;
};

/**
 * Keyed on the job's own key rather than its id: completed disciplinary jobs
 * are purged after a week, and a hydrated retry keeps the key it was queued
 * under.
 */
export function disciplinaryJobDedupeKey(deduplicationKey: string) {
  return `disciplinary:${deduplicationKey}`;
}

export function buildDisciplinaryJobNotification(
  job: DisciplinaryJobToMirror,
): MirrorNotification {
  const payload = job.payload;
  const note = payload.participantNote?.trim() || null;
  if (payload.entityType === "infraction") {
    return {
      kind: INFRACTION_KINDS[payload.kind],
      data: {
        infractionId: payload.infractionId,
        profileId: payload.profile.id,
        typeLabel: payload.typeLabel,
        festivalName: payload.festivalName,
        note,
      },
    };
  }
  return {
    kind: SANCTION_KINDS[payload.kind],
    data: {
      sanctionId: payload.sanctionId,
      profileId: payload.profile.id,
      typeLabel: payload.typeLabel,
      scopeLabel: payload.scopeLabel,
      infractionLabels: payload.infractionLabels,
      note,
      festivalName: payload.festivalName,
      festivalId: job.festivalId ?? null,
      reservationEligibleAt: payload.reservationEligibleAt,
    },
  };
}

/**
 * Writes the inbox copy of a notice the caller just queued (or, in the worker,
 * a retry it just filled in), in a savepoint of the caller's transaction, so
 * it commits or rolls back with that write. Every caller passes one; given
 * `db`, it would run in a transaction of its own.
 *
 * It never throws: a failure costs the inbox item and is logged, and cannot
 * undo the sanction or the infraction the email already reports.
 */
export async function mirrorDisciplinaryNotificationJob(
  executor: typeof db | DbTx,
  job: DisciplinaryJobToMirror,
): Promise<void> {
  try {
    await (executor as typeof db).transaction(async (tx) => {
      const built = buildDisciplinaryJobNotification(job);
      await notify(tx, {
        userId: job.userId,
        kind: built.kind,
        data: built.data,
        dedupeKey: disciplinaryJobDedupeKey(job.deduplicationKey),
      } as Parameters<typeof notify>[1]);
    });
  } catch (error) {
    console.error(
      "[notifications] Inbox copy of a disciplinary notice failed",
      {
        kind: `${job.payload.entityType}:${job.payload.kind}`,
        jobKey: job.deduplicationKey,
        error: mirrorFailureType(error),
      },
    );
  }
}
