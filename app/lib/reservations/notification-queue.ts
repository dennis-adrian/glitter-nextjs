import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { reservationNotificationJobs } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The write half of the notification outbox, deliberately kept apart from
 * delivery.
 *
 * Enqueueing is a row insert that any transactional writer may need;
 * delivering pulls in every email template and the server env schema. While
 * both lived in one module, importing it to queue a job dragged Resend and
 * `UPLOADTHING_TOKEN` into services whose unit tests have no business knowing
 * either. Writers import this; only the job runner imports the outbox.
 */
export const RESERVATION_NOTIFICATION_KINDS = [
  "reservation_created",
  "proof_submitted",
  "zero_value_review_requested",
  "settlement_approved",
  "settlement_rejected",
  "reservation_rejected",
  "deadline_extended",
  "festival_participation_approved",
  "festival_participation_rejected",
  // The only credit notification there is. Buying credits is synchronous and
  // the wallet shows the result immediately, so a receipt for it would be
  // noise; a rejection is the one thing that happens later, out of the
  // participant's sight, and can leave them owing money.
  "credit_top_up_rejected",
  // Sent to the owner and every participant when a reservation is released.
  // The owner chose it; a partner is finding out, which is why delivery tells
  // them apart rather than sending one message to everybody.
  "reservation_released",
  // Sent to the owner who paid and the partner who was added. The partner did
  // not ask for this, so their copy is an invitation rather than a receipt.
  "late_partner_added",
] as const;

export type ReservationNotificationKind =
  (typeof RESERVATION_NOTIFICATION_KINDS)[number];

export async function enqueueReservationNotification(
  tx: DbTx,
  input: {
    kind: ReservationNotificationKind;
    reservationId?: number | null;
    userId?: number | null;
    recipientEmail: string;
    payload?: Record<string, unknown>;
    deduplicationKey?: string;
  },
): Promise<number | null> {
  const email = input.recipientEmail.trim();
  if (!email) return null;
  const now = new Date();
  const reservationId = input.reservationId ?? null;
  const deduplicationKey =
    input.deduplicationKey ??
    `${input.kind}:${reservationId ?? "none"}:${email.toLowerCase()}`;

  const [inserted] = await tx
    .insert(reservationNotificationJobs)
    .values({
      deduplicationKey,
      userId: input.userId ?? null,
      reservationId,
      notificationKind: input.kind,
      recipientEmail: email,
      payload: {
        ...(reservationId != null ? { reservationId } : {}),
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
