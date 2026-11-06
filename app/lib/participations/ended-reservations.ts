import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { adminCancellationReason } from "@/app/lib/reservations/cancellation-reason";
import { reservationStandLabel } from "@/app/lib/reservations/member-stands";
import { db } from "@/db";
import {
  reservationNotificationJobs,
  reservationParticipants,
  standReservationEvents,
} from "@/db/schema";

export type ClosedReservation = {
  reservationId: number;
  standLabel: string;
  /** What the team wrote when closing it; optional in the admin form. */
  reason: string | null;
};

export type ReleasedReservation = {
  reservationId: number;
  standLabel: string;
  releasedAt: Date | null;
};

/** The reason in the latest cancellation email queued for this participant. */
async function fetchEmailedReason(reservationId: number, userId: number) {
  const [job] = await db
    .select({ payload: reservationNotificationJobs.payload })
    .from(reservationNotificationJobs)
    .where(
      and(
        eq(reservationNotificationJobs.reservationId, reservationId),
        eq(reservationNotificationJobs.userId, userId),
        eq(reservationNotificationJobs.notificationKind, "reservation_rejected"),
      ),
    )
    .orderBy(desc(reservationNotificationJobs.id))
    .limit(1);
  const payload = job?.payload;
  return payload && typeof payload === "object"
    ? adminCancellationReason((payload as { reason?: unknown }).reason)
    : null;
}

/**
 * The participant's reservations in a festival that are no longer live. A
 * reservation the team rejected or cancelled (both are stored as "rejected";
 * "cancelled" is kept for older rows) closes the festival for them: they
 * cannot reserve again. One they released themselves does not, and only its
 * owner is told about it.
 */
export async function fetchEndedReservations(
  userId: number,
  festivalId: number,
): Promise<{
  closed: ClosedReservation | null;
  released: ReleasedReservation | null;
}> {
  const rows = await db.query.reservationParticipants.findMany({
    where: eq(reservationParticipants.userId, userId),
    columns: { id: true },
    with: {
      reservation: {
        columns: {
          id: true,
          festivalId: true,
          status: true,
          updatedAt: true,
          ownerUserId: true,
        },
        with: {
          stand: true,
          members: { with: { stand: true } },
          events: {
            where: inArray(standReservationEvents.eventType, [
              "rejected",
              "deleted",
            ]),
            orderBy: [desc(standReservationEvents.createdAt)],
            limit: 1,
            columns: { payload: true },
          },
        },
      },
    },
  });

  const ended = rows
    .map((row) => row.reservation)
    .filter((reservation) => reservation.festivalId === festivalId)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const closedRow = ended.find(
    (reservation) =>
      reservation.status === "rejected" || reservation.status === "cancelled",
  );
  // Only the owner can release, and only the owner pays for it: a partner
  // left on a released reservation did neither, so it says nothing to them.
  const releasedRow = ended.find(
    (reservation) =>
      reservation.status === "released" && reservation.ownerUserId === userId,
  );

  const reasonOf = (payload: unknown) =>
    payload && typeof payload === "object"
      ? adminCancellationReason((payload as { reason?: unknown }).reason)
      : null;

  // The event log keeps the reason, except when a reservation is cancelled
  // while rejecting a payment proof: that path stores its own payload on the
  // event, and the reason only reaches the email sent to this participant.
  const closedReason = closedRow
    ? (reasonOf(closedRow.events[0]?.payload) ??
      (await fetchEmailedReason(closedRow.id, userId)))
    : null;

  return {
    closed: closedRow
      ? {
          reservationId: closedRow.id,
          standLabel: reservationStandLabel(closedRow),
          reason: closedReason,
        }
      : null,
    released: releasedRow
      ? {
          reservationId: releasedRow.id,
          // Releasing stamps each member row; the label falls back to the
          // originally selected stand once no member is left occupying.
          standLabel: reservationStandLabel({
            stand: releasedRow.stand,
            members: releasedRow.members.map((member) => ({
              ...member,
              releasedAt: null,
            })),
          }),
          releasedAt:
            releasedRow.members
              .map((member) => member.releasedAt)
              .filter((date): date is Date => date != null)
              .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        }
      : null,
  };
}
