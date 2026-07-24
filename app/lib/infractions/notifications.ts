import { randomUUID } from "crypto";
import type { ReactElement } from "react";
import { z } from "zod";
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
} from "drizzle-orm";

import InfractionLifecycleEmail, {
  getInfractionEmailSubject,
  type InfractionEmailKind,
} from "@/app/emails/infraction-lifecycle";
import SanctionLifecycleEmail, {
  getSanctionEmailSubject,
  type SanctionEmailKind,
} from "@/app/emails/sanction-lifecycle";
import {
  sanctionFestivalScopeLabel,
  sanctionStatusLabel,
  sanctionTypeLabel,
} from "@/app/lib/sanctions/mappers";
import { db } from "@/db";
import {
  disciplinaryNotificationJobs,
  festivals,
  infractions,
  infractionTypes,
  sanctionFestivals,
  sanctions,
  users,
} from "@/db/schema";

const FROM = "Perfiles Glitter <perfiles@productoraglitter.com>";
const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type NotificationExecutor = typeof db | DbTx;
type NotificationJob = typeof disciplinaryNotificationJobs.$inferSelect;

const notificationProfileSchema = z.object({
  id: z.number().int().positive(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

const infractionNotificationPayloadSchema = z.object({
  entityType: z.literal("infraction"),
  kind: z.enum(["registered", "edited", "resolved", "voided"]),
  profile: notificationProfileSchema,
  infractionId: z.number().int().positive(),
  typeLabel: z.string(),
  festivalName: z.string().nullable(),
  participantNote: z.string().nullable(),
});

const sanctionNotificationPayloadSchema = z.object({
  entityType: z.literal("sanction"),
  kind: z.enum([
    "approved",
    "edited",
    "expired",
    "revoked",
    "reservation_access_enabled",
  ]),
  profile: notificationProfileSchema,
  sanctionId: z.number().int().positive(),
  typeLabel: z.string(),
  statusLabel: z.string(),
  scopeLabel: z.string(),
  infractionLabels: z.array(z.string()),
  participantNote: z.string().nullable(),
  festivalName: z.string().nullable(),
  reservationEligibleAt: z.string().datetime().nullable(),
});

const disciplinaryNotificationPayloadSchema = z.discriminatedUnion(
  "entityType",
  [infractionNotificationPayloadSchema, sanctionNotificationPayloadSchema],
);

export type DisciplinaryNotificationPayload = z.infer<
  typeof disciplinaryNotificationPayloadSchema
>;

function computeNextAttemptAt(attemptCount: number, now = new Date()) {
  const delayMs = Math.min(
    60_000 * 2 ** Math.max(attemptCount - 1, 0),
    MAX_BACKOFF_MS,
  );
  return new Date(now.getTime() + delayMs);
}

function leaseExpiresAt(now = new Date()) {
  return new Date(now.getTime() + LEASE_DURATION_MS);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return "Error desconocido al enviar la notificación";
  }
}

async function loadParticipant(executor: NotificationExecutor, userId: number) {
  return executor.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      email: true,
      displayName: true,
      firstName: true,
      lastName: true,
    },
  });
}

async function insertNotificationJob(
  executor: NotificationExecutor,
  input: {
    deduplicationKey: string;
    userId: number;
    entityType: "infraction" | "sanction";
    entityId: number;
    notificationKind: string;
    recipientEmail: string;
    payload: DisciplinaryNotificationPayload;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const [inserted] = await executor
    .insert(disciplinaryNotificationJobs)
    .values({
      deduplicationKey: input.deduplicationKey,
      userId: input.userId,
      entityType: input.entityType,
      entityId: input.entityId,
      notificationKind: input.notificationKind,
      recipientEmail: input.recipientEmail,
      payload: input.payload,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: disciplinaryNotificationJobs.deduplicationKey,
    })
    .returning({ id: disciplinaryNotificationJobs.id });

  if (inserted) return inserted.id;

  const existing = await executor.query.disciplinaryNotificationJobs.findFirst({
    where: eq(
      disciplinaryNotificationJobs.deduplicationKey,
      input.deduplicationKey,
    ),
    columns: { id: true },
  });
  if (!existing) {
    throw new Error("No se pudo encolar la notificación disciplinaria");
  }
  return existing.id;
}

/**
 * Enqueues a participant-safe infraction snapshot in the caller's transaction.
 * `participantNote` must only contain information explicitly visible to the
 * participant; administrative edit reasons must never be passed here.
 */
export async function enqueueInfractionLifecycleNotification(
  tx: DbTx,
  input: {
    userId: number;
    infractionId: number;
    kind: InfractionEmailKind;
    deduplicationKey: string;
    participantNote?: string | null;
    now?: Date;
  },
): Promise<number> {
  const [profile, infraction] = await Promise.all([
    loadParticipant(tx, input.userId),
    tx.query.infractions.findFirst({
      where: eq(infractions.id, input.infractionId),
      columns: { id: true },
      with: {
        type: { columns: { label: true } },
        festival: { columns: { name: true } },
      },
    }),
  ]);

  if (!profile || !infraction) {
    throw new Error("No se pudo preparar la notificación de la infracción");
  }

  return insertNotificationJob(tx, {
    deduplicationKey: input.deduplicationKey,
    userId: profile.id,
    entityType: "infraction",
    entityId: infraction.id,
    notificationKind: input.kind,
    recipientEmail: profile.email,
    now: input.now,
    payload: {
      entityType: "infraction",
      kind: input.kind,
      profile,
      infractionId: infraction.id,
      typeLabel: infraction.type.label,
      festivalName: infraction.festival?.name ?? null,
      participantNote: input.participantNote ?? null,
    },
  });
}

/**
 * Enqueues one participant-safe sanction snapshot, irrespective of how many
 * infractions support the sanction.
 */
export async function enqueueSanctionLifecycleNotification(
  tx: DbTx,
  input: {
    sanctionId: number;
    kind: SanctionEmailKind;
    deduplicationKey: string;
    participantNote?: string | null;
    festivalName?: string | null;
    reservationEligibleAt?: Date | null;
    now?: Date;
  },
): Promise<number> {
  const sanction = await tx.query.sanctions.findFirst({
    where: eq(sanctions.id, input.sanctionId),
    columns: {
      id: true,
      userId: true,
      type: true,
      status: true,
      festivalScope: true,
    },
    with: {
      sanctionInfractions: {
        columns: { infractionId: true },
      },
    },
  });
  if (!sanction) {
    throw new Error("No se pudo preparar la notificación de la sanción");
  }

  const profile = await loadParticipant(tx, sanction.userId);
  if (!profile) {
    throw new Error("No se encontró al participante de la sanción");
  }

  const infractionIds = sanction.sanctionInfractions.map(
    (link) => link.infractionId,
  );
  const linkedTypes =
    infractionIds.length === 0
      ? []
      : await tx
          .select({ label: infractionTypes.label })
          .from(infractions)
          .innerJoin(
            infractionTypes,
            eq(infractionTypes.id, infractions.typeId),
          )
          .where(inArray(infractions.id, infractionIds));

  return insertNotificationJob(tx, {
    deduplicationKey: input.deduplicationKey,
    userId: profile.id,
    entityType: "sanction",
    entityId: sanction.id,
    notificationKind: input.kind,
    recipientEmail: profile.email,
    now: input.now,
    payload: {
      entityType: "sanction",
      kind: input.kind,
      profile,
      sanctionId: sanction.id,
      typeLabel: sanctionTypeLabel[sanction.type],
      statusLabel: sanctionStatusLabel[sanction.status],
      scopeLabel: sanctionFestivalScopeLabel[sanction.festivalScope],
      infractionLabels: linkedTypes.map((row) => row.label),
      participantNote: input.participantNote ?? null,
      festivalName: input.festivalName ?? null,
      reservationEligibleAt: input.reservationEligibleAt?.toISOString() ?? null,
    },
  });
}

async function claimNotificationJob(jobId: number, owner: string) {
  const now = new Date();
  const [claimed] = await db
    .update(disciplinaryNotificationJobs)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: leaseExpiresAt(now),
      updatedAt: now,
    })
    .where(
      and(
        eq(disciplinaryNotificationJobs.id, jobId),
        or(
          eq(disciplinaryNotificationJobs.status, "pending"),
          and(
            eq(disciplinaryNotificationJobs.status, "processing"),
            isNotNull(disciplinaryNotificationJobs.leaseExpiresAt),
            lt(disciplinaryNotificationJobs.leaseExpiresAt, now),
          ),
        ),
        lte(disciplinaryNotificationJobs.nextAttemptAt, now),
      ),
    )
    .returning();

  return claimed ?? null;
}

export async function deliverDisciplinaryNotificationPayload(
  rawPayload: unknown,
  idempotencyKey: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = disciplinaryNotificationPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      success: false,
      error: `Payload de notificación inválido: ${parsed.error.message}`,
    };
  }

  const payload = parsed.data;
  const { sendEmail } = await import("@/app/vendors/resend");
  const result =
    payload.entityType === "infraction"
      ? await sendEmail(
          {
            to: [payload.profile.email],
            from: FROM,
            subject: getInfractionEmailSubject(payload.kind),
            react: InfractionLifecycleEmail({
              profile: payload.profile,
              kind: payload.kind,
              infractionId: payload.infractionId,
              typeLabel: payload.typeLabel,
              festivalName: payload.festivalName,
              note: payload.participantNote,
            }) as ReactElement,
          },
          { idempotencyKey },
        )
      : await sendEmail(
          {
            to: [payload.profile.email],
            from: FROM,
            subject: getSanctionEmailSubject(payload.kind),
            react: SanctionLifecycleEmail({
              profile: payload.profile,
              kind: payload.kind,
              sanctionId: payload.sanctionId,
              typeLabel: payload.typeLabel,
              statusLabel: payload.statusLabel,
              scopeLabel: payload.scopeLabel,
              infractionLabels: payload.infractionLabels,
              note: payload.participantNote,
              festivalName: payload.festivalName,
              reservationEligibleAt: payload.reservationEligibleAt,
            }) as ReactElement,
          },
          { idempotencyKey },
        );

  if (result.error) {
    return { success: false, error: errorMessage(result.error) };
  }
  return { success: true };
}

async function completeNotificationJob(job: NotificationJob, owner: string) {
  const now = new Date();
  const [completed] = await db
    .update(disciplinaryNotificationJobs)
    .set({
      status: "completed",
      attempts: job.attempts + 1,
      completedAt: now,
      lastError: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(disciplinaryNotificationJobs.id, job.id),
        eq(disciplinaryNotificationJobs.status, "processing"),
        eq(disciplinaryNotificationJobs.leaseOwner, owner),
      ),
    )
    .returning({ id: disciplinaryNotificationJobs.id });

  return completed != null;
}

async function rescheduleNotificationJob(
  job: NotificationJob,
  owner: string,
  error: string,
) {
  const now = new Date();
  const attempts = job.attempts + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const [updated] = await db
    .update(disciplinaryNotificationJobs)
    .set({
      status: terminal ? "failed" : "pending",
      attempts,
      lastError: error,
      nextAttemptAt: terminal
        ? job.nextAttemptAt
        : computeNextAttemptAt(attempts, now),
      leaseOwner: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(disciplinaryNotificationJobs.id, job.id),
        eq(disciplinaryNotificationJobs.status, "processing"),
        eq(disciplinaryNotificationJobs.leaseOwner, owner),
      ),
    )
    .returning({ status: disciplinaryNotificationJobs.status });

  return updated?.status ?? null;
}

async function processClaimedNotificationJob(
  job: NotificationJob,
  owner: string,
) {
  let result: Awaited<
    ReturnType<typeof deliverDisciplinaryNotificationPayload>
  >;
  try {
    result = await deliverDisciplinaryNotificationPayload(
      job.payload,
      job.deduplicationKey,
    );
  } catch (error) {
    result = { success: false, error: errorMessage(error) };
  }

  if (result.success) {
    const completed = await completeNotificationJob(job, owner);
    return completed ? ("completed" as const) : ("claim_lost" as const);
  }

  const status = await rescheduleNotificationJob(job, owner, result.error);
  if (status === "failed") return "failed" as const;
  if (status === "pending") return "rescheduled" as const;
  return "claim_lost" as const;
}

/**
 * Makes a best-effort immediate attempt while keeping the durable job for
 * scheduled retry when the provider is unavailable.
 */
export async function attemptDisciplinaryNotificationJob(jobId: number) {
  try {
    const owner = randomUUID();
    const job = await claimNotificationJob(jobId, owner);
    if (!job) return { success: false, outcome: "not_claimed" as const };

    const outcome = await processClaimedNotificationJob(job, owner);
    return { success: outcome === "completed", outcome };
  } catch (error) {
    console.error(
      "[disciplinary-notifications] Immediate attempt failed; job retained",
      { jobId, error },
    );
    return { success: false, outcome: "retry_pending" as const };
  }
}

async function selectDueNotificationJobIds(limit: number) {
  const now = new Date();
  return db
    .select({ id: disciplinaryNotificationJobs.id })
    .from(disciplinaryNotificationJobs)
    .where(
      and(
        or(
          eq(disciplinaryNotificationJobs.status, "pending"),
          and(
            eq(disciplinaryNotificationJobs.status, "processing"),
            isNotNull(disciplinaryNotificationJobs.leaseExpiresAt),
            lt(disciplinaryNotificationJobs.leaseExpiresAt, now),
          ),
        ),
        lte(disciplinaryNotificationJobs.nextAttemptAt, now),
      ),
    )
    .orderBy(asc(disciplinaryNotificationJobs.createdAt))
    .limit(limit);
}

export async function processPendingDisciplinaryNotificationJobs(limit = 50) {
  const due = await selectDueNotificationJobIds(limit);
  let completed = 0;
  let failed = 0;
  let rescheduled = 0;
  let claimLost = 0;

  for (const { id } of due) {
    const owner = randomUUID();
    const job = await claimNotificationJob(id, owner);
    if (!job) continue;

    const outcome = await processClaimedNotificationJob(job, owner);
    if (outcome === "completed") completed += 1;
    else if (outcome === "failed") failed += 1;
    else if (outcome === "rescheduled") rescheduled += 1;
    else claimLost += 1;
  }

  return {
    due: due.length,
    completed,
    failed,
    rescheduled,
    claimLost,
  };
}

/**
 * Enqueues newly enabled reservation access exactly once per sanction/festival.
 * The association marker and durable job are committed in the same transaction.
 */
export async function enqueueEnabledReservationAccessNotifications(
  tx: DbTx,
  now: Date,
): Promise<number[]> {
  const candidates = await tx
    .select({
      sanctionId: sanctionFestivals.sanctionId,
      festivalId: sanctionFestivals.festivalId,
      festivalName: festivals.name,
      reservationEligibleAt: sanctionFestivals.reservationEligibleAt,
    })
    .from(sanctionFestivals)
    .innerJoin(sanctions, eq(sanctions.id, sanctionFestivals.sanctionId))
    .innerJoin(festivals, eq(festivals.id, sanctionFestivals.festivalId))
    .where(
      and(
        isNull(sanctionFestivals.reservationAccessNotificationQueuedAt),
        isNotNull(sanctionFestivals.reservationEligibleAt),
        lte(sanctionFestivals.reservationEligibleAt, now),
        eq(sanctions.type, "reservation_delay"),
        eq(sanctions.status, "active"),
      ),
    );

  const jobIds: number[] = [];
  for (const candidate of candidates) {
    if (!candidate.reservationEligibleAt) continue;

    let jobId: number;
    try {
      jobId = await enqueueSanctionLifecycleNotification(tx, {
        sanctionId: candidate.sanctionId,
        kind: "reservation_access_enabled",
        deduplicationKey: [
          "sanction",
          candidate.sanctionId,
          "festival",
          candidate.festivalId,
          "reservation-access",
          candidate.reservationEligibleAt.toISOString(),
        ].join(":"),
        festivalName: candidate.festivalName,
        reservationEligibleAt: candidate.reservationEligibleAt,
        now,
      });
    } catch (error) {
      console.error(
        "[disciplinary-notifications] Failed to enqueue reservation-access notification",
        {
          sanctionId: candidate.sanctionId,
          festivalId: candidate.festivalId,
          error,
        },
      );
      continue;
    }

    const [claimed] = await tx
      .update(sanctionFestivals)
      .set({ reservationAccessNotificationQueuedAt: now })
      .where(
        and(
          eq(sanctionFestivals.sanctionId, candidate.sanctionId),
          eq(sanctionFestivals.festivalId, candidate.festivalId),
          isNull(sanctionFestivals.reservationAccessNotificationQueuedAt),
        ),
      )
      .returning({ sanctionId: sanctionFestivals.sanctionId });
    if (!claimed) continue;

    jobIds.push(jobId);
  }

  return jobIds;
}
