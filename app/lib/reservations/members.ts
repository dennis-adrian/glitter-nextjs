import "server-only";

import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  standHoldMembers,
  standReservationStands,
  standReservations,
} from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Reservation statuses that still occupy a stand.
 *
 * Deliberately narrower than "blocks the participant": `cancelled` and
 * `rejected` release capacity while still blocking their registered
 * participants, and `released` blocks nobody (PRD §11). Anything asking "is
 * this stand taken?" uses this list; anything asking "may this person book?"
 * uses the policy predicate instead.
 */
export const OCCUPYING_RESERVATION_STATUSES = [
  "pending",
  "verification_payment",
  "accepted",
] as const;

/** The same predicate as a SQL fragment, for use inside a larger condition. */
export const occupyingMemberPredicate = sql`${standReservationStands.releasedAt} IS NULL AND ${standReservationStands.reservationStatus} IN ('pending', 'verification_payment', 'accepted')`;

/**
 * Attaches stands to a capacity hold. `standIds` is ordered: index 0 is the
 * half the participant actually picked, which the half-table fallback copy and
 * any later manual downgrade both refer back to.
 */
export async function insertHoldMembers(
  tx: DbTx,
  holdId: number,
  standIds: readonly number[],
) {
  if (standIds.length === 0) return;
  await tx.insert(standHoldMembers).values(
    standIds.map((standId, position) => ({
      holdId,
      standId,
      position,
    })),
  );
}

/**
 * Attaches stands to a reservation aggregate, in the same selection order.
 *
 * `reservation_status` is filled by a database trigger from the parent row, so
 * it is deliberately absent here — the denormalised copy exists only to back
 * the occupancy index and must never be written by application code.
 */
export async function insertReservationMembers(
  tx: DbTx,
  reservationId: number,
  standIds: readonly number[],
) {
  if (standIds.length === 0) return;
  await tx.insert(standReservationStands).values(
    standIds.map((standId, position) => ({
      reservationId,
      standId,
      position,
    })),
  );
}

/** Stand ids a hold currently covers, in selection order. */
export async function holdMemberStandIds(
  tx: DbTx,
  holdId: number,
): Promise<number[]> {
  const rows = await tx
    .select({ standId: standHoldMembers.standId })
    .from(standHoldMembers)
    .where(eq(standHoldMembers.holdId, holdId))
    .orderBy(asc(standHoldMembers.position));
  return rows.map((row) => row.standId);
}

/** Stand ids a reservation still occupies, in selection order. */
export async function activeReservationStandIds(
  tx: DbTx,
  reservationId: number,
): Promise<number[]> {
  const rows = await tx
    .select({ standId: standReservationStands.standId })
    .from(standReservationStands)
    .where(
      and(
        eq(standReservationStands.reservationId, reservationId),
        isNull(standReservationStands.releasedAt),
      ),
    )
    .orderBy(asc(standReservationStands.position));
  return rows.map((row) => row.standId);
}

/**
 * Retires one member without deleting it, so the history of a full table that
 * was manually downgraded stays queryable. Returns whether a live member was
 * actually released.
 */
export async function releaseReservationMember(
  tx: DbTx,
  input: { reservationId: number; standId: number; now?: Date },
): Promise<boolean> {
  const released = await tx
    .update(standReservationStands)
    .set({ releasedAt: input.now ?? new Date() })
    .where(
      and(
        eq(standReservationStands.reservationId, input.reservationId),
        eq(standReservationStands.standId, input.standId),
        isNull(standReservationStands.releasedAt),
      ),
    )
    .returning({ id: standReservationStands.id });
  return released.length > 0;
}

/**
 * Stand ids occupied by live reservations, resolved through membership rather
 * than the parent's legacy `stand_id` column.
 */
export async function occupiedStandIds(
  tx: DbTx,
  standIds: readonly number[],
): Promise<Set<number>> {
  if (standIds.length === 0) return new Set();
  const rows = await tx
    .select({ standId: standReservationStands.standId })
    .from(standReservationStands)
    .where(
      and(
        inArray(standReservationStands.standId, [...standIds]),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          ...OCCUPYING_RESERVATION_STATUSES,
        ]),
      ),
    );
  return new Set(rows.map((row) => row.standId));
}

/**
 * Reservation ids that currently occupy any of the given stands, with the
 * member stand that matched.
 */
export async function liveReservationsForStands(
  tx: DbTx,
  standIds: readonly number[],
) {
  if (standIds.length === 0) return [];
  return tx
    .select({
      reservationId: standReservationStands.reservationId,
      standId: standReservationStands.standId,
      position: standReservationStands.position,
      status: standReservations.status,
    })
    .from(standReservationStands)
    .innerJoin(
      standReservations,
      eq(standReservations.id, standReservationStands.reservationId),
    )
    .where(
      and(
        inArray(standReservationStands.standId, [...standIds]),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          ...OCCUPYING_RESERVATION_STATUSES,
        ]),
      ),
    );
}

/**
 * Whether any reservation — live or historical — still references these stands.
 *
 * Checks membership as well as the parent's `stand_id`: a full table's
 * companion is reachable only through membership, and a half retired by an
 * admin downgrade keeps its member row, so both pin the stand. Callers use this
 * to refuse a delete that the `stand_reservation_stands` foreign key would
 * otherwise reject with an opaque error.
 */
export async function standsHaveReservations(
  tx: DbTx,
  standIds: readonly number[],
): Promise<boolean> {
  if (standIds.length === 0) return false;
  const ids = [...standIds];
  const [existing] = await tx
    .select({ id: standReservations.id })
    .from(standReservations)
    .leftJoin(
      standReservationStands,
      eq(standReservationStands.reservationId, standReservations.id),
    )
    .where(
      or(
        inArray(standReservations.standId, ids),
        inArray(standReservationStands.standId, ids),
      ),
    )
    .limit(1);

  return existing != null;
}
