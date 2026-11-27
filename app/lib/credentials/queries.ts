import "server-only";

import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type {
  CredentialBatchRow,
  CredentialReservationRow,
  CredentialsData,
} from "@/app/lib/credentials/calculate";
import {
  COUNTABLE_RESERVATION_STATUSES,
  type CountableReservationStatus,
} from "@/app/lib/credentials/definitions";
import { getExternalParticipantCategoryLabel } from "@/app/lib/external_participants/definitions";
import { getUserName } from "@/app/lib/users/utils";
import type { db } from "@/db";
import {
  credentialPrintBatches,
  credentialPrintBatchItems,
  externalParticipants,
  festivalCredentialRules,
  festivalExternalCredentialOverrides,
  festivalExtraCredentials,
  festivals,
  festivalStaffMembers,
  reservationExternalParticipants,
  reservationParticipants,
  standReservations,
  standReservationStands,
  stands,
  staffMembers,
  users,
  volunteerApplications,
  volunteerRoles,
} from "@/db/schema";

/**
 * The credentials page's reads, always scoped by festival. The database handle
 * is the first argument with no default, so the batch action can pass its
 * transaction: calling the module-level `db` inside one would take a second
 * pooled connection (docs/PLAN-database-reliability-hardening.md §2). The page
 * and the CSV export read through `fetchCredentialsSnapshot`.
 */

export type CredentialsDatabase =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

type Options = {
  /**
   * Statements in flight at once: at most 3 from a page, and 1 (one after
   * another) on a transaction, which has a single connection.
   */
  concurrency?: number;
};

async function runLimited<T extends readonly (() => Promise<unknown>)[]>(
  tasks: T,
  concurrency: number,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]!();
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, worker),
  );
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> };
}

const countedStatus = inArray(standReservations.status, [
  ...COUNTABLE_RESERVATION_STATUSES,
]);

/**
 * Everything the calculator needs for one festival, or null when the festival
 * does not exist. All three countable statuses are loaded: the toggles are
 * applied in the browser by the calculator.
 */
export async function fetchCredentialsData(
  database: CredentialsDatabase,
  festivalId: number,
  { concurrency = 3 }: Options = {},
): Promise<CredentialsData | null> {
  const [festival] = await database
    .select({ id: festivals.id, name: festivals.name })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1);
  if (!festival) return null;

  const [
    reservationRows,
    participantRows,
    externalRows,
    volunteerRows,
    volunteerStatusRows,
    staffRows,
    extraRows,
    ruleRows,
    overrideRows,
    batchRows,
    itemRows,
  ] = await runLimited(
    [
      // Stands come from the membership table, never the legacy
      // `stand_reservations.stand_id`. A left join keeps a reservation whose
      // members are all released, so the calculator can warn about it.
      () =>
        database
          .select({
            id: standReservations.id,
            status: standReservations.status,
            ownerUserId: standReservations.ownerUserId,
            position: standReservationStands.position,
            standId: stands.id,
            label: stands.label,
            standNumber: stands.standNumber,
            standCategory: stands.standCategory,
          })
          .from(standReservations)
          .leftJoin(
            standReservationStands,
            and(
              eq(standReservationStands.reservationId, standReservations.id),
              isNull(standReservationStands.releasedAt),
            ),
          )
          .leftJoin(stands, eq(stands.id, standReservationStands.standId))
          .where(and(eq(standReservations.festivalId, festivalId), countedStatus))
          .orderBy(asc(standReservations.id), asc(standReservationStands.position)),
      () =>
        database
          .select({
            participationId: reservationParticipants.id,
            reservationId: reservationParticipants.reservationId,
            userId: users.id,
            displayName: users.displayName,
            firstName: users.firstName,
            lastName: users.lastName,
            status: users.status,
          })
          .from(reservationParticipants)
          .innerJoin(
            standReservations,
            eq(standReservations.id, reservationParticipants.reservationId),
          )
          .innerJoin(users, eq(users.id, reservationParticipants.userId))
          .where(and(eq(standReservations.festivalId, festivalId), countedStatus))
          .orderBy(asc(reservationParticipants.id)),
      () =>
        database
          .select({
            reservationId: reservationExternalParticipants.reservationId,
            externalParticipantId: externalParticipants.id,
            displayName: externalParticipants.displayName,
            type: externalParticipants.type,
            customCategoryLabel: externalParticipants.customCategoryLabel,
          })
          .from(reservationExternalParticipants)
          .innerJoin(
            standReservations,
            eq(standReservations.id, reservationExternalParticipants.reservationId),
          )
          .innerJoin(
            externalParticipants,
            eq(externalParticipants.id, reservationExternalParticipants.externalParticipantId),
          )
          .where(and(eq(standReservations.festivalId, festivalId), countedStatus))
          .orderBy(asc(reservationExternalParticipants.id)),
      () =>
        database
          .select({
            applicationId: volunteerApplications.id,
            fullName: volunteerApplications.fullName,
            roleName: volunteerRoles.name,
          })
          .from(volunteerApplications)
          .leftJoin(
            volunteerRoles,
            and(
              eq(volunteerRoles.id, volunteerApplications.assignedRoleId),
              eq(volunteerRoles.festivalId, volunteerApplications.festivalId),
            ),
          )
          .where(
            and(
              eq(volunteerApplications.festivalId, festivalId),
              eq(volunteerApplications.status, "accepted"),
            ),
          )
          .orderBy(asc(volunteerApplications.id)),
      () =>
        database
          .select({
            status: volunteerApplications.status,
            total: count(),
            withoutRole: sql<number>`count(*) filter (where ${volunteerApplications.assignedRoleId} is null)`.mapWith(
              Number,
            ),
          })
          .from(volunteerApplications)
          .where(eq(volunteerApplications.festivalId, festivalId))
          .groupBy(volunteerApplications.status),
      () =>
        database
          .select({
            id: staffMembers.id,
            fullName: staffMembers.fullName,
            roleLabel: staffMembers.roleLabel,
            isActive: staffMembers.isActive,
            selectedAt: festivalStaffMembers.createdAt,
          })
          .from(staffMembers)
          .leftJoin(
            festivalStaffMembers,
            and(
              eq(festivalStaffMembers.staffMemberId, staffMembers.id),
              eq(festivalStaffMembers.festivalId, festivalId),
            ),
          )
          .where(
            or(
              eq(staffMembers.isActive, true),
              sql`${festivalStaffMembers.staffMemberId} IS NOT NULL`,
            ),
          )
          .orderBy(asc(staffMembers.fullName), asc(staffMembers.id)),
      () =>
        database
          .select({
            id: festivalExtraCredentials.id,
            name: festivalExtraCredentials.name,
            label: festivalExtraCredentials.label,
            quantity: festivalExtraCredentials.quantity,
          })
          .from(festivalExtraCredentials)
          .where(eq(festivalExtraCredentials.festivalId, festivalId))
          .orderBy(asc(festivalExtraCredentials.id)),
      () =>
        database
          .select({
            group: festivalCredentialRules.group,
            quantity: festivalCredentialRules.quantity,
            namingMode: festivalCredentialRules.namingMode,
          })
          .from(festivalCredentialRules)
          .where(eq(festivalCredentialRules.festivalId, festivalId)),
      () =>
        database
          .select({
            externalParticipantId: festivalExternalCredentialOverrides.externalParticipantId,
            quantity: festivalExternalCredentialOverrides.quantity,
            standsAtOverride: festivalExternalCredentialOverrides.standsAtOverride,
          })
          .from(festivalExternalCredentialOverrides)
          .where(eq(festivalExternalCredentialOverrides.festivalId, festivalId)),
      () =>
        database
          .select({
            id: credentialPrintBatches.id,
            note: credentialPrintBatches.note,
            createdAt: credentialPrintBatches.createdAt,
            displayName: users.displayName,
            firstName: users.firstName,
            lastName: users.lastName,
          })
          .from(credentialPrintBatches)
          .leftJoin(users, eq(users.id, credentialPrintBatches.createdByUserId))
          .where(eq(credentialPrintBatches.festivalId, festivalId))
          .orderBy(asc(credentialPrintBatches.createdAt), asc(credentialPrintBatches.id)),
      () =>
        database
          .select({
            batchId: credentialPrintBatchItems.batchId,
            unitKey: credentialPrintBatchItems.unitKey,
            group: credentialPrintBatchItems.group,
            userId: credentialPrintBatchItems.userId,
            printedName: credentialPrintBatchItems.printedName,
            detail: credentialPrintBatchItems.detail,
            namedCount: credentialPrintBatchItems.namedCount,
            unnamedCount: credentialPrintBatchItems.unnamedCount,
            isReprint: credentialPrintBatchItems.isReprint,
          })
          .from(credentialPrintBatchItems)
          .where(eq(credentialPrintBatchItems.festivalId, festivalId))
          .orderBy(asc(credentialPrintBatchItems.id)),
    ] as const,
    concurrency,
  );

  const reservations = new Map<number, CredentialReservationRow>();
  for (const row of reservationRows) {
    const reservation = reservations.get(row.id) ?? {
      id: row.id,
      status: row.status as CountableReservationStatus,
      ownerUserId: row.ownerUserId,
      stands: [],
    };
    if (row.standId != null && row.standNumber != null && row.standCategory != null) {
      reservation.stands.push({
        id: row.standId,
        label: row.label,
        standNumber: row.standNumber,
        standCategory: row.standCategory,
        position: row.position ?? 0,
      });
    }
    reservations.set(row.id, reservation);
  }

  const statusCounts = new Map(volunteerStatusRows.map((row) => [row.status, row]));
  const accepted = statusCounts.get("accepted");

  const itemsByBatch = new Map<number, CredentialBatchRow["items"]>();
  for (const { batchId, ...item } of itemRows) {
    const list = itemsByBatch.get(batchId) ?? [];
    list.push(item);
    itemsByBatch.set(batchId, list);
  }

  return {
    festival,
    reservations: [...reservations.values()],
    participants: participantRows.map((row) => ({
      participationId: row.participationId,
      reservationId: row.reservationId,
      user: {
        id: row.userId,
        displayName: row.displayName,
        firstName: row.firstName,
        lastName: row.lastName,
        status: row.status,
      },
    })),
    externals: externalRows.map((row) => ({
      reservationId: row.reservationId,
      externalParticipantId: row.externalParticipantId,
      displayName: row.displayName,
      categoryLabel: getExternalParticipantCategoryLabel(row),
    })),
    volunteers: volunteerRows,
    volunteerCounts: {
      accepted: accepted?.total ?? 0,
      withoutRole: accepted?.withoutRole ?? 0,
      waiting:
        (statusCounts.get("pending")?.total ?? 0) +
        (statusCounts.get("waitlist")?.total ?? 0),
    },
    staff: staffRows.map(({ selectedAt, ...row }) => ({
      ...row,
      selected: selectedAt != null,
    })),
    extras: extraRows,
    ruleRows,
    externalOverrides: overrideRows,
    batches: batchRows.map((row) => ({
      id: row.id,
      note: row.note,
      createdAt: row.createdAt,
      createdByName: getUserName(row) || null,
      items: itemsByBatch.get(row.id) ?? [],
    })),
  };
}

/**
 * The page's and the CSV export's read: every statement on one read-only
 * REPEATABLE READ snapshot, one after another on a single connection. Separate
 * statements could otherwise straddle a write: a reservation that stops
 * counting would keep its row but lose its participants ("no tiene
 * participantes"), and an undone batch could keep its header but lose its items.
 *
 * Not for the actions. There the first statement is the advisory lock, and
 * under REPEATABLE READ its snapshot would be taken before the wait, missing a
 * batch committed meanwhile. They read on their own READ COMMITTED transaction
 * after the lock, which also keeps the batch history whole.
 */
export function fetchCredentialsSnapshot(
  database: typeof db,
  festivalId: number,
): Promise<CredentialsData | null> {
  return database.transaction(
    (tx) => fetchCredentialsData(tx, festivalId, { concurrency: 1 }),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
