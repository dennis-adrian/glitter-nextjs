import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { festivals, stands, userRequests, users } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Distinct from tickets (4711) and festival-terms (5822). */
export const RESERVATION_PARTICIPANT_LOCK_NAMESPACE = 6933;

export async function lockParticipants(
  tx: DbTx,
  festivalId: number,
  userIds: readonly number[],
) {
  const unique = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))].sort(
    (a, b) => a - b,
  );
  for (const userId of unique) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(${RESERVATION_PARTICIPANT_LOCK_NAMESPACE}, hashtext(${`${festivalId}:${userId}`}))`,
    );
  }
}

export async function lockFestivalRow(tx: DbTx, festivalId: number) {
  const [row] = await tx
    .select({ id: festivals.id })
    .from(festivals)
    .where(eq(festivals.id, festivalId))
    .limit(1)
    .for("update");
  return row ?? null;
}

export async function lockParticipantEligibilityRows(
  tx: DbTx,
  festivalId: number,
  userIds: readonly number[],
) {
  const unique = [
    ...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0)),
  ].sort((a, b) => a - b);
  for (const userId of unique) {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
      .for("update");
  }
  for (const userId of unique) {
    await tx
      .select({ id: userRequests.id })
      .from(userRequests)
      .where(
        and(
          eq(userRequests.userId, userId),
          eq(userRequests.festivalId, festivalId),
        ),
      )
      .orderBy(userRequests.id)
      .for("update");
  }
}

export async function lockStandRows(tx: DbTx, standIds: readonly number[]) {
  const unique = [...new Set(standIds)].sort((a, b) => a - b);
  const locked: number[] = [];
  for (const standId of unique) {
    const [row] = await tx
      .select({ id: stands.id })
      .from(stands)
      .where(eq(stands.id, standId))
      .limit(1)
      .for("update");
    if (row) locked.push(row.id);
  }
  return locked;
}
