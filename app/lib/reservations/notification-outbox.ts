import "server-only";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";

import { randomUUID } from "crypto";
import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";

import ReservationCreatedEmailTemplate from "@/app/emails/reservation-created";
import ReservationConfirmationEmailTemplate from "@/app/emails/reservation-confirmation";
import ReservationRejectionEmailTemplate from "@/app/emails/reservation-rejection";
import ReservationPaymentExtensionTemplate from "@/app/emails/reservation-payment-extension";
import PaymentConfirmationForAdminsEmailTemplate from "@/app/emails/payment-confirmation-for-admins";
import PaymentConfirmationForUserEmailTemplate from "@/app/emails/payment-confirmation-for-user";
import FestivalParticipationApprovedEmailTemplate from "@/app/emails/festival-participation-approved";
import FestivalParticipationRejectedEmailTemplate from "@/app/emails/festival-participation-rejected";
import CreditTopUpRejectedTemplate from "@/app/emails/credit-top-up-rejected";
import ReservationReleasedTemplate from "@/app/emails/reservation-released";
import { InvoiceWithPaymentsAndStandAndProfile } from "@/app/data/invoices/definitions";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { formatStandLabel } from "@/app/lib/stands/helpers";
import { sendEmail } from "@/app/vendors/resend";
import { db } from "@/db";
import {
  enqueueReservationNotification,
  type ReservationNotificationKind,
} from "@/app/lib/reservations/notification-queue";
import {
  creditTopUps,
  festivals,
  reservationNotificationJobs,
  standReservations,
  users,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const FROM = "Reservas Glitter <reservas@productoraglitter.com>";
const ENROLLMENT_FROM =
  "Inscripciones Glitter <inscripciones@productoraglitter.com>";
const CREDITS_FROM = "Créditos Glitter <creditos@productoraglitter.com>";
const MAX_ATTEMPTS = 5;
const LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

// Re-exported so existing importers keep one entry point; the definitions now
// live in `notification-queue` so a writer can enqueue without importing every
// email template.
export { RESERVATION_NOTIFICATION_KINDS } from "@/app/lib/reservations/notification-queue";
export { enqueueReservationNotification };
export type { ReservationNotificationKind };

function computeNextAttemptAt(attemptCount: number, now = new Date()) {
  const delay = Math.min(
    MAX_BACKOFF_MS,
    30_000 * 2 ** Math.max(0, attemptCount - 1),
  );
  return new Date(now.getTime() + delay);
}

export function scheduleReservationNotificationJobs(jobIds: readonly number[]) {
  const unique = [
    ...new Set(jobIds.filter((id) => Number.isInteger(id) && id > 0)),
  ];
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

function rejectionReasonFromPayload(payload: unknown): string | undefined {
  if (
    !payload ||
    typeof payload !== "object" ||
    !("reason" in payload) ||
    typeof (payload as { reason: unknown }).reason !== "string"
  ) {
    return undefined;
  }
  const reason = (payload as { reason: string }).reason.trim();
  return reason || undefined;
}

async function deliverJob(
  kind: string,
  recipientEmail: string,
  reservationId: number,
  payload: unknown,
) {
  const reservation = await db.query.standReservations.findFirst({
    where: eq(standReservations.id, reservationId),
    with: {
      stand: true,
      members: { with: { stand: true } },
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
        standCategory: getCategoryOccupationLabel(
          reservation.stand.standCategory,
          {
            singular: false,
          },
        ),
      }),
    });
    return;
  }

  if (
    (kind === "proof_submitted" || kind === "zero_value_review_requested") &&
    invoice
  ) {
    const invoiceForEmail = {
      ...invoice,
      reservation,
    } as InvoiceWithPaymentsAndStandAndProfile;
    const isOwner =
      owner?.email?.toLowerCase() === recipientEmail.toLowerCase();
    if (isOwner) {
      await sendEmail({
        to: [recipientEmail],
        from: FROM,
        subject:
          kind === "zero_value_review_requested"
            ? "Tu reserva está en revisión"
            : "Tu pago ha sido registrado",
        react: PaymentConfirmationForUserEmailTemplate({
          invoice: invoiceForEmail,
        }),
      });
    } else {
      await sendEmail({
        to: [recipientEmail],
        from: FROM,
        subject:
          kind === "zero_value_review_requested"
            ? `${owner?.displayName ?? "Un participante"} solicitó revisión de una reserva sin costo`
            : `${owner?.displayName ?? "Un participante"} hizo el pago de su reserva`,
        react: PaymentConfirmationForAdminsEmailTemplate({
          invoice: invoiceForEmail,
        }),
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

  if (kind === "reservation_rejected" && owner) {
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject: "Tu reserva fue rechazada",
      react: ReservationRejectionEmailTemplate({
        festival,
        profile: owner,
        stand: reservation.stand,
        standLabel: reservationStandLabel(reservation),
        reason: rejectionReasonFromPayload(payload),
      }),
    });
    return;
  }

  if (kind === "settlement_rejected") {
    if (reservation.status === "rejected" && owner) {
      await sendEmail({
        to: [recipientEmail],
        from: FROM,
        subject: "Tu reserva fue rechazada",
        react: ReservationRejectionEmailTemplate({
          festival,
          profile: owner,
          stand: reservation.stand,
          standLabel: reservationStandLabel(reservation),
          reason: rejectionReasonFromPayload(payload),
        }),
      });
      return;
    }
    // Proof sent back for correction: reservation stays pending. Do not send
    // the cancellation template.
    return;
  }

  if (kind === "reservation_released") {
    // The canonical owner, not the invoice's user: a released reservation's
    // invoice is cancelled, and identifying who did this from payment records
    // would be guessing at it.
    const releasedBy =
      reservation.participants.find(
        (participant) => participant.userId === reservation.ownerUserId,
      )?.user ?? owner;
    const recipient = reservation.participants.find(
      (participant) =>
        participant.user.email?.toLowerCase() === recipientEmail.toLowerCase(),
    )?.user;
    if (!recipient || !releasedBy) return;

    const standCount = Math.max(1, reservation.members.length);
    await sendEmail({
      to: [recipientEmail],
      from: FROM,
      subject:
        recipient.id === releasedBy.id
          ? "Liberaste tu reserva"
          : "Se liberó la reserva que compartías",
      react: ReservationReleasedTemplate({
        recipient,
        owner: releasedBy,
        isOwner: recipient.id === releasedBy.id,
        festivalId: reservation.festivalId,
        festivalName: festival.name,
        standLabel: reservationStandLabel(reservation),
        standCount,
        creditPrice: payloadAmount(payload, "creditPrice") ?? 0,
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
          members: reservation.members.map((member) => ({
            position: member.position,
            releasedAt: member.releasedAt,
            stand: {
              label: member.stand.label,
              standNumber: member.stand.standNumber,
            },
          })),
          festival: { name: festival.name },
        },
        newDueDate: invoice?.dueAt ?? new Date(),
      }),
    });
    return;
  }

  throw new Error(`unsupported_kind:${kind}`);
}

function payloadNumber(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/** Money, so unlike `payloadNumber` it accepts zero and two-decimal amounts. */
function payloadAmount(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function deliverEnrollmentJob(
  kind: ReservationNotificationKind,
  recipientEmail: string,
  payload: unknown,
) {
  const userId = payloadNumber(payload, "userId");
  const festivalId = payloadNumber(payload, "festivalId");
  if (userId == null || festivalId == null) {
    throw new Error("enrollment_payload_missing");
  }

  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [festival] = await db
    .select({
      id: festivals.id,
      name: festivals.name,
      festivalType: festivals.festivalType,
      reservationsStartDate: festivals.reservationsStartDate,
    })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!profile || !festival) {
    throw new Error("enrollment_context_missing");
  }

  if (kind === "festival_participation_approved") {
    await sendEmail({
      to: [recipientEmail],
      from: ENROLLMENT_FROM,
      subject: `Tu postulación para ${festival.name} fue aprobada`,
      react: FestivalParticipationApprovedEmailTemplate({
        profile,
        festival,
      }),
    });
    return;
  }

  if (kind === "festival_participation_rejected") {
    await sendEmail({
      to: [recipientEmail],
      from: ENROLLMENT_FROM,
      subject: `Tu postulación para ${festival.name}`,
      react: FestivalParticipationRejectedEmailTemplate({
        profile,
        festival,
      }),
    });
    return;
  }

  throw new Error(`unsupported_kind:${kind}`);
}

function isEnrollmentNotificationKind(kind: string) {
  return (
    kind === "festival_participation_approved" ||
    kind === "festival_participation_rejected"
  );
}

function isCreditNotificationKind(kind: string) {
  return kind === "credit_top_up_rejected";
}

/**
 * Credit mail, which hangs off a top-up rather than a reservation.
 *
 * The amount and reason are read back from the row instead of the payload:
 * the job may be retried days later, and the record of what was rejected and
 * why belongs to `credit_top_ups`, not to a queued message. Only the debt is
 * taken from the payload, because it is a fact about the moment of rejection —
 * later spending or an admin waiver would otherwise rewrite history in an
 * email about something that already happened.
 */
async function deliverCreditJob(
  kind: string,
  recipientEmail: string,
  payload: unknown,
) {
  const topUpId = payloadNumber(payload, "topUpId");
  if (topUpId == null) throw new Error("credit_payload_missing");

  const [topUp] = await db
    .select({
      amount: creditTopUps.amount,
      rejectionReason: creditTopUps.rejectionReason,
      userId: creditTopUps.userId,
    })
    .from(creditTopUps)
    .where(eq(creditTopUps.id, topUpId))
    .limit(1);
  if (!topUp) throw new Error("credit_top_up_missing");

  const [profile] = await db
    .select()
    .from(users)
    .where(eq(users.id, topUp.userId))
    .limit(1);
  if (!profile) throw new Error("credit_profile_missing");

  if (kind === "credit_top_up_rejected") {
    const debtAmount = Math.max(0, payloadAmount(payload, "debtAmount") ?? 0);
    await sendEmail({
      to: [recipientEmail],
      from: CREDITS_FROM,
      subject: "No pudimos confirmar tu compra de créditos",
      react: CreditTopUpRejectedTemplate({
        profile,
        amount: Number(topUp.amount),
        reason: topUp.rejectionReason?.trim() || "No se indicó un motivo.",
        debtAmount,
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
    if (isEnrollmentNotificationKind(job.notificationKind)) {
      await deliverEnrollmentJob(
        job.notificationKind as ReservationNotificationKind,
        job.recipientEmail,
        job.payload,
      );
    } else if (isCreditNotificationKind(job.notificationKind)) {
      await deliverCreditJob(
        job.notificationKind,
        job.recipientEmail,
        job.payload,
      );
    } else {
      if (!job.reservationId) {
        throw new Error("reservation_id_missing");
      }
      await deliverJob(
        job.notificationKind,
        job.recipientEmail,
        job.reservationId,
        job.payload,
      );
    }
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
