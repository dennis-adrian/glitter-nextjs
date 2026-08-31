import "server-only";

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

export async function insertStandReservationEvent(
  tx: DbTx,
  input: {
    reservationId: number;
    actorUserId?: number | null;
    eventType: ReservationEventType;
    fromStatus?: ReservationStatus | null;
    toStatus?: ReservationStatus | null;
    payload?: Record<string, unknown> | null;
  },
) {
  await tx.insert(standReservationEvents).values({
    reservationId: input.reservationId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    fromStatus: input.fromStatus ?? null,
    toStatus: input.toStatus ?? null,
    payload: input.payload ?? null,
  });
}
