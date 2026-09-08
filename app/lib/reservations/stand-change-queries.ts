import "server-only";

import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { canViewAdminReservationData } from "@/app/lib/reservations/policy";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  externalParticipants,
  festivalSectors,
  reservationExternalParticipants,
  reservationParticipants,
  standGroups,
  standHoldMembers,
  standHolds,
  standReservationStands,
  standReservations,
  stands,
  users,
} from "@/db/schema";

export type StandChangeOccupant = {
  reservationId: number;
  status: string;
  /** Who the admin would be exchanging with, for the confirmation dialog. */
  displayName: string;
  /** A full table cannot take part in a switch or an exchange. */
  isFullTable: boolean;
};

export type StandChangeOption = {
  standId: number;
  label: string | null;
  standNumber: number;
  standCategory: string;
  sectorId: number | null;
  sectorName: string;
  individualPrice: number;
  sharedPrice: number | null;
  status: string;
  /** Set when a live reservation occupies the stand. */
  occupant: StandChangeOccupant | null;
  /** Somebody is mid-checkout on it; nothing may take it until that resolves. */
  heldNow: boolean;
};

/**
 * Every stand an admin could move a reservation onto, with the facts the
 * picker needs to say why one cannot be picked.
 *
 * Occupied stands are included rather than filtered out: selecting one is how
 * an admin reaches the exchange, and hiding them would make the exchange
 * undiscoverable. The caller disables what it must, with the reason showing.
 */
export async function fetchStandChangeOptions(
  festivalId: number,
  now = new Date(),
): Promise<StandChangeOption[]> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return [];

  const standRows = await db
    .select({
      standId: stands.id,
      label: stands.label,
      standNumber: stands.standNumber,
      standCategory: stands.standCategory,
      status: stands.status,
      individualPrice: stands.individualPrice,
      sharedPrice: stands.sharedPrice,
      sectorId: festivalSectors.id,
      sectorName: festivalSectors.name,
    })
    .from(stands)
    .leftJoin(festivalSectors, eq(festivalSectors.id, stands.festivalSectorId))
    .where(eq(stands.festivalId, festivalId))
    .orderBy(asc(festivalSectors.orderInFestival), asc(stands.standNumber));

  const standIds = standRows.map((row) => row.standId);
  if (standIds.length === 0) return [];

  // Occupancy resolves through membership, never the parent's `stand_id`: a
  // full table is reachable only through its member rows.
  const memberRows = await db
    .select({
      standId: standReservationStands.standId,
      reservationId: standReservationStands.reservationId,
      status: standReservations.status,
    })
    .from(standReservationStands)
    .innerJoin(
      standReservations,
      eq(standReservations.id, standReservationStands.reservationId),
    )
    .where(
      and(
        inArray(standReservationStands.standId, standIds),
        isNull(standReservationStands.releasedAt),
        inArray(standReservationStands.reservationStatus, [
          "pending",
          "verification_payment",
          "accepted",
        ]),
      ),
    );

  const reservationIds = [
    ...new Set(memberRows.map((row) => row.reservationId)),
  ];

  const memberCounts = new Map<number, number>();
  if (reservationIds.length > 0) {
    const countRows = await db
      .select({
        reservationId: standReservationStands.reservationId,
        liveMembers: sql<number>`count(*)::int`,
      })
      .from(standReservationStands)
      .where(
        and(
          inArray(standReservationStands.reservationId, reservationIds),
          isNull(standReservationStands.releasedAt),
        ),
      )
      .groupBy(standReservationStands.reservationId);
    for (const row of countRows) {
      memberCounts.set(row.reservationId, row.liveMembers);
    }
  }

  const namesByReservation = new Map<number, string>();
  if (reservationIds.length > 0) {
    const participantRows = await db
      .select({
        reservationId: reservationParticipants.reservationId,
        displayName: users.displayName,
        email: users.email,
      })
      .from(reservationParticipants)
      .innerJoin(users, eq(users.id, reservationParticipants.userId))
      .where(inArray(reservationParticipants.reservationId, reservationIds))
      .orderBy(asc(reservationParticipants.id));
    for (const row of participantRows) {
      if (namesByReservation.has(row.reservationId)) continue;
      namesByReservation.set(
        row.reservationId,
        row.displayName ?? row.email ?? `Reserva ${row.reservationId}`,
      );
    }

    const externalRows = await db
      .select({
        reservationId: reservationExternalParticipants.reservationId,
        displayName: externalParticipants.displayName,
      })
      .from(reservationExternalParticipants)
      .innerJoin(
        externalParticipants,
        eq(
          externalParticipants.id,
          reservationExternalParticipants.externalParticipantId,
        ),
      )
      .where(
        inArray(reservationExternalParticipants.reservationId, reservationIds),
      );
    for (const row of externalRows) {
      if (namesByReservation.has(row.reservationId)) continue;
      namesByReservation.set(row.reservationId, row.displayName);
    }
  }

  const heldStandIds = new Set(
    (
      await db
        .select({ standId: standHoldMembers.standId })
        .from(standHoldMembers)
        .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
        .where(
          and(
            inArray(standHoldMembers.standId, standIds),
            gt(standHolds.expiresAt, now),
          ),
        )
    ).map((row) => row.standId),
  );

  const occupantByStand = new Map<number, StandChangeOccupant>();
  for (const row of memberRows) {
    occupantByStand.set(row.standId, {
      reservationId: row.reservationId,
      status: row.status,
      displayName:
        namesByReservation.get(row.reservationId) ??
        `Reserva ${row.reservationId}`,
      isFullTable: (memberCounts.get(row.reservationId) ?? 1) > 1,
    });
  }

  return standRows.map((row) => ({
    standId: row.standId,
    label: row.label,
    standNumber: row.standNumber,
    standCategory: row.standCategory,
    sectorId: row.sectorId,
    sectorName: row.sectorName ?? "Sin sector",
    individualPrice: row.individualPrice,
    sharedPrice: row.sharedPrice,
    status: row.status,
    occupant: occupantByStand.get(row.standId) ?? null,
    heldNow: heldStandIds.has(row.standId),
  }));
}

export type FullTableOption = {
  standId: number;
  label: string | null;
  standNumber: number;
  standCategory: string;
  sectorId: number;
  sectorName: string;
  groupId: number;
  fullTablePrice: number | null;
  companionStandId: number | null;
  companionLabel: string | null;
  companionStandNumber: number | null;
  /** Free means neither half is occupied, held, or otherwise unavailable. */
  selfAvailable: boolean;
  companionAvailable: boolean;
};

/**
 * Both halves of every declared full table in a festival, priced and paired.
 *
 * Malformed groups — anything that is not exactly two stands — and unpriced
 * ones are returned rather than dropped, carrying the nulls that say so: an
 * admin who declared a table and forgot its price needs to see that, not an
 * empty list.
 */
export async function fetchFullTableOptions(
  festivalId: number,
  now = new Date(),
): Promise<FullTableOption[]> {
  const actor = await getCurrentUserProfile();
  if (!canViewAdminReservationData(actor)) return [];

  const rows = await db
    .select({
      standId: stands.id,
      label: stands.label,
      standNumber: stands.standNumber,
      standCategory: stands.standCategory,
      status: stands.status,
      sectorId: festivalSectors.id,
      sectorName: festivalSectors.name,
      groupId: standGroups.id,
      fullTablePrice: standGroups.fullTablePrice,
    })
    .from(stands)
    .innerJoin(standGroups, eq(standGroups.id, stands.standGroupId))
    .innerJoin(festivalSectors, eq(festivalSectors.id, stands.festivalSectorId))
    .where(
      and(
        eq(stands.festivalId, festivalId),
        eq(standGroups.type, "full_table"),
      ),
    )
    .orderBy(asc(festivalSectors.orderInFestival), asc(stands.standNumber));
  if (rows.length === 0) return [];

  const standIds = rows.map((row) => row.standId);
  const occupied = new Set(
    (
      await db
        .select({ standId: standReservationStands.standId })
        .from(standReservationStands)
        .where(
          and(
            inArray(standReservationStands.standId, standIds),
            isNull(standReservationStands.releasedAt),
            inArray(standReservationStands.reservationStatus, [
              "pending",
              "verification_payment",
              "accepted",
            ]),
          ),
        )
    ).map((row) => row.standId),
  );
  const held = new Set(
    (
      await db
        .select({ standId: standHoldMembers.standId })
        .from(standHoldMembers)
        .innerJoin(standHolds, eq(standHolds.id, standHoldMembers.holdId))
        .where(
          and(
            inArray(standHoldMembers.standId, standIds),
            gt(standHolds.expiresAt, now),
          ),
        )
    ).map((row) => row.standId),
  );

  // `disabled` counts as free here for the same reason the create form offers
  // one: an admin disables a stand precisely to hand it out themselves.
  const isFree = (standId: number, status: string) =>
    !occupied.has(standId) &&
    !held.has(standId) &&
    (status === "available" || status === "disabled");

  const byGroup = new Map<number, typeof rows>();
  for (const row of rows) {
    const bucket = byGroup.get(row.groupId) ?? [];
    bucket.push(row);
    byGroup.set(row.groupId, bucket);
  }

  return rows.map((row) => {
    const siblings = byGroup.get(row.groupId) ?? [];
    const companion =
      siblings.length === 2
        ? (siblings.find((sibling) => sibling.standId !== row.standId) ?? null)
        : null;
    return {
      standId: row.standId,
      label: row.label,
      standNumber: row.standNumber,
      standCategory: row.standCategory,
      sectorId: row.sectorId,
      sectorName: row.sectorName,
      groupId: row.groupId,
      fullTablePrice: row.fullTablePrice,
      companionStandId: companion?.standId ?? null,
      companionLabel: companion?.label ?? null,
      companionStandNumber: companion?.standNumber ?? null,
      selfAvailable: isFree(row.standId, row.status),
      companionAvailable:
        companion != null && isFree(companion.standId, companion.status),
    };
  });
}
