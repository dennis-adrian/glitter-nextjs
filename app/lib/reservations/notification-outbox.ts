import "server-only";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import ReservationConfirmationEmailTemplate from "@/app/emails/reservation-confirmation";
import ReservationRejectionEmailTemplate from "@/app/emails/reservation-rejection";
import ReservationPaymentExtensionTemplate from "@/app/emails/reservation-payment-extension";
import PaymentConfirmationForAdminsEmailTemplate from "@/app/emails/payment-confirmation-for-admins";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import { reservationNotificationJobs, standReservations } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const FROM = "Reservas Glitter <reservas@productoraglitter.com>";
const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

export const RESERVATION_NOTIFICATION_KINDS = [
  "reservation_created",
  "proof_submitted",
  "zero_value_review_requested",
  "settlement_approved",
  "settlement_rejected",
  "reservation_rejected",
  "deadline_extended",
] as const;

export type ReservationNotificationKind =
  (typeof RESERVATION_NOTIFICATION_KINDS)[number];

function computeNextAttemptAt(attemptCount: number, now = new Date()) {
  const delay = Math.min(MAX_BACKOFF_MS, 30_000 * 2 ** Math.max(0, attemptCount - 1));
  return new Date(now.getTime() + delay);
}

export async function enqueueReservationNotification(
  tx: DbTx,
  input: {
    kind: ReservationNotificationKind;
    reservationId: number;
    userId?: number | null;
    recipientEmail: string;
    payload?: Record<string, unknown>;
    deduplicationKey?: string;
  },
): Promise<number | null> {
  const email = input.recipientEmail.trim();
  if (!email) return null;
  const now = new Date();
  const deduplicationKey =
    input.deduplicationKey ??
    `${input.kind}:${input.reservationId}:${email.toLowerCase()}`;

  const [inserted] = await tx
    .insert(reservationNotificationJobs)
    .values({
      deduplicationKey,
      userId: input.userId ?? null,
      reservationId: input.reservationId,
      notificationKind: input.kind,
      recipientEmail: email,
      payload: {
        reservationId: input.reservationId,
        ...input.payload,
      },
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoNothing({
      target: reservationNotificationJobs.deduplicationKey,
    })
    .returning({ id: reservationNotificationJobs.id });

  if (inserted) return inserted.id;

  const existing = await tx.query.reservationNotificationJobs.findFirst({
    where: eq(reservationNotificationJobs.deduplicationKey, deduplicationKey),
    columns: { id: true },
  });
  return existing?.id ?? null;
}

export function scheduleReservationNotificationJobs(jobIds: readonly number[]) {
  const unique = [...new Set(jobIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return;
  after(() => {
    void Promise.all(
      unique.map((jobId) => attemptReservationNotificationJob(jobId)),
    );
  });
}

async function claimJob(jobId: number, owner: string) {
  const now = new Date();
  const [claimed] = await db
    .update(reservationNotificationJobs)
    .set({
      status: "processing",
      leaseOwner: owner,
      leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(reservationNotificationJobs.id, jobId),
        sql`(
          ${reservationNotificationJobs.status} = 'pending'
          OR (
            ${reservationNotificationJobs.status} = 'processing'
            AND ${reservationNotificationJobs.leaseExpiresAt} IS NOT NULL
            AND ${reservationNotificationJobs.leaseExpiresAt} < ${now}
          )
        )`,
        sql`${reservationNotificationJobs.nextAttemptAt} <= ${now}`,
      ),
    )
    .returning();
  return claimed ?? null;
}

async function deliverJob(
  kind: string,
  recipientEmail: string,
  reservationId: number,
) {
  const reservation = await db.query.standReservations.findFirst({
    where: eq(standReservations.id, reservationId),
    with: {
      stand: true,
      festival: { with: { festivalDates: true } },
      participants: { with: { user: true } },
      invoices: { with: { user: true, payments: true } },
    },
  });
  if (!reservation) {
    throw new Error("reservation_missing");
  }

  const invoice =
    reservation.invoices.find((row) => row.status !== "cancelled") ??
    reservation.invoices[0];
  const owner = invoice?.user ?? reservation.participants[0]?.user;
  const standLabel = formatStandLabel(reservation.stand);
  const festival = reservation.festival;

  if (kind === "reservation_created") {
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject: "Nueva reserva creada",
      react: ReservationCreatedEmailTemplate({
        festivalName: festival.name,
        reservationId: reservation.id,
        creatorName: owner?.displayName || "Usuario",
        standName: standLabel,
        standCategory: getCategoryOccupationLabel(reservation.stand.standCategory, {
          singular: false,
        }),
      }),
    });
    return;
  }

  if (
    (kind === "proof_submitted" || kind === "zero_value_review_requested") &&
    invoice
  ) {
    const isOwner = owner?.email?.toLowerCase() === recipientEmail.toLowerCase();
    if (isOwner) {
      await sendEmail({
        to: [recipientEmail],
        from: FROM,
        subject:
          kind === "zero_value_review_requested"
            ? "Tu reserva está en revisión"
            : "Tu pago ha sido registrado",
        react: PaymentConfirmationForUserEmailTemplate({ invoice }),
      });
    } else {
      await sendEmail({
        to: [recipientEmail],
        from: FROM,
        subject:
          kind === "zero_value_review_requested"
            ? `${owner?.displayName ?? "Un participante"} solicitó revisión de una reserva sin costo`
            : `${owner?.displayName ?? "Un participante"} hizo el pago de su reserva`,
        react: PaymentConfirmationForAdminsEmailTemplate({ invoice }),
      });
    }
    return;
  }

  if (kind === "settlement_approved" && owner) {
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject: `Reserva confirmada para el festival ${festival.name}`,
      react: ReservationConfirmationEmailTemplate({
        profile: owner,
        standLabel,
        festival,
      }),
    });
    return;
  }

  if (
    (kind === "settlement_rejected" || kind === "reservation_rejected") &&
    owner
  ) {
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject: "Tu reserva fue rechazada",
      react: ReservationRejectionEmailTemplate({
        festival,
        profile: owner,
        stand: reservation.stand,
        reason: undefined,
      }),
    });
    return;
  }

  if (kind === "deadline_extended" && owner) {
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject: "Se extendió el plazo de pago de tu reserva",
      react: ReservationPaymentExtensionTemplate({
        profile: owner,
        reservation: {
          id: reservation.id,
          festivalId: reservation.festivalId,
          stand: {
            label: reservation.stand.label,
            standNumber: reservation.stand.standNumber,
          },
          festival: { name: festival.name },
        },
        newDueDate: invoice?.dueAt ?? new Date(),
      }),
    });
    return;
  }

  throw new Error(`unsupported_kind:${kind}`);
}

export async function attemptReservationNotificationJob(jobId: number) {
  const owner = `reservation-notify:${randomUUID()}`;
  const job = await claimJob(jobId, owner);
  if (!job) return { processed: false as const };

  const now = new Date();
  try {
    if (!job.reservationId) {
      throw new Error("reservation_id_missing");
    }
    await deliverJob(job.notificationKind, job.recipientEmail, job.reservationId);
    await db
      .update(reservationNotificationJobs)
      .set({
        status: "completed",
        completedAt: now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(reservationNotificationJobs.id, job.id),
          eq(reservationNotificationJobs.leaseOwner, owner),
        ),
      );
    return { processed: true as const, status: "completed" as const };
  } catch (error) {
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const sanitized =
      error instanceof Error ? error.message.slice(0, 180) : "send_failed";
    await db
      .update(reservationNotificationJobs)
      .set({
        status: failed ? "failed" : "pending",
        attempts,
        lastError: sanitized,
        nextAttemptAt: computeNextAttemptAt(attempts, now),
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(reservationNotificationJobs.id, job.id),
          eq(reservationNotificationJobs.leaseOwner, owner),
        ),
      );
    return {
      processed: true as const,
      status: failed ? ("failed" as const) : ("retry" as const),
    };
  }
}

export async function processPendingReservationNotificationJobs(limit = 50) {
  const now = new Date();
  const result = await db.execute(sql`
    SELECT id
    FROM reservation_notification_jobs
    WHERE (
        status = 'pending'
        OR (
          status = 'processing'
          AND lease_expires_at IS NOT NULL
          AND lease_expires_at < ${now}
        )
      )
      AND next_attempt_at <= ${now}
    ORDER BY created_at ASC
    LIMIT ${limit}
  `);
  const ids = (result.rows ?? [])
    .map((row) => Number((row as { id: number | string }).id))
    .filter((id) => Number.isFinite(id));

  let completed = 0;
  let failed = 0;
  for (const id of ids) {
    const outcome = await attemptReservationNotificationJob(id);
    if (outcome.processed && outcome.status === "completed") completed += 1;
    if (outcome.processed && outcome.status === "failed") failed += 1;
  }
  return { scanned: ids.length, completed, failed };
}

export async function enqueueAdminAndOwnerNotifications(
  tx: DbTx,
  input: {
    kind: ReservationNotificationKind;
    reservationId: number;
    ownerUserId: number;
    ownerEmail: string | null | undefined;
    adminEmails: Array<{ id: number; email: string | null }>;
    payload?: Record<string, unknown>;
  },
): Promise<number[]> {
  const jobIds: number[] = [];
  if (input.ownerEmail) {
    const id = await enqueueReservationNotification(tx, {
      kind: input.kind,
      reservationId: input.reservationId,
      userId: input.ownerUserId,
      recipientEmail: input.ownerEmail,
      payload: input.payload,
    });
    if (id) jobIds.push(id);
  }
  for (const admin of input.adminEmails) {
    if (!admin.email) continue;
    const id = await enqueueReservationNotification(tx, {
      kind: input.kind,
      reservationId: input.reservationId,
      userId: admin.id,
      recipientEmail: admin.email,
      payload: input.payload,
      deduplicationKey: `${input.kind}:${input.reservationId}:admin:${admin.id}`,
    });
    if (id) jobIds.push(id);
  }
  return jobIds;
}
