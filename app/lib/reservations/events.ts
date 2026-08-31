import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  standReservationEvents,
  type reservationStatusEnum,
  type standReservationEventTypeEnum,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ReservationStatus = (typeof reservationStatusEnum.enumValues)[number];
type ReservationEventType =
  (typeof standReservationEventTypeEnum.enumValues)[number];

export class StandReservationEventIdempotencyConflictError extends Error {
  constructor(message = "stand_reservation_event_idempotency_conflict") {
    super(message);
    this.name = "StandReservationEventIdempotencyConflictError";
  }
}

export async function insertStandReservationEvent(
  tx: DbTx,
  input: {
    reservationId: number;
    actorUserId?: number | null;
    eventType: ReservationEventType;
    fromStatus?: ReservationStatus | null;
    toStatus?: ReservationStatus | null;
    payload?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  },
) {
  if (input.idempotencyKey) {
    const [existing] = await tx
      .select({
        id: standReservationEvents.id,
        actorUserId: standReservationEvents.actorUserId,
      })
      .from(standReservationEvents)
      .where(
        and(
          eq(standReservationEvents.reservationId, input.reservationId),
          eq(standReservationEvents.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (
        existing.actorUserId != null &&
        input.actorUserId != null &&
        existing.actorUserId !== input.actorUserId
      ) {
        throw new StandReservationEventIdempotencyConflictError();
      }
      return;
    }
  }

  await tx.insert(standReservationEvents).values({
    reservationId: input.reservationId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    payload: input.payload ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });
}
