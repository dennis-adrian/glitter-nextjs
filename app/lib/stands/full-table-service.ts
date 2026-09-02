import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  type FullTablePairProblem,
  validateFullTablePair,
} from "@/app/lib/stands/full-table-pairs";
import { loadStandGroupMembers } from "@/app/lib/stands/full-table-health";
import { lockStandRows } from "@/app/lib/reservations/locks";
import { db } from "@/db";
import { standGroups, standReservations, stands } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type FullTableConfigResult =
  | { ok: true; groupId: number; type: "visual_group" | "full_table" }
  | { ok: false; code: "GROUP_NOT_FOUND"; problems?: undefined }
  | { ok: false; code: "OCCUPIED"; problems?: undefined }
  | { ok: false; code: "INVALID_PAIR"; problems: FullTablePairProblem[] };

/** Any reservation still holding one of these stands. */
async function hasLiveOccupancy(tx: DbTx, standIds: readonly number[]) {
  if (standIds.length === 0) return false;
  const [row] = await tx
    .select({ id: standReservations.id })
    .from(standReservations)
    .where(
      and(
        inArray(standReservations.standId, [...standIds]),
        sql`${standReservations.status} IN ('pending', 'verification_payment', 'accepted')`,
      ),
    )
    .limit(1);
  return row != null;
}

/**
 * Declares a stand group a full table, or returns it to a visual group.
 *
 * The exactly-two-members rule and the matching-attributes rules are cross-row
 * invariants no column can express, so this command is the only sanctioned way
 * to set the type — a direct write can still produce a malformed group, which
 * is why the health report checks the same rules.
 *
 * Locks the group and its stands before validating, so a concurrent price or
 * membership edit cannot slip between the check and the write.
 */
export async function setStandGroupFullTable(input: {
  groupId: number;
  enabled: boolean;
}): Promise<FullTableConfigResult> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: standGroups.id, type: standGroups.type })
      .from(standGroups)
      .where(eq(standGroups.id, input.groupId))
      .limit(1)
      .for("update");
    if (!group) return { ok: false, code: "GROUP_NOT_FOUND" };

    const memberIds = await tx
      .select({ id: stands.id })
      .from(stands)
      .where(eq(stands.standGroupId, input.groupId));
    await lockStandRows(
      tx,
      memberIds.map((row) => row.id),
    );

    // Re-read under the stand locks; membership may have changed.
    const members = await loadStandGroupMembers(tx, input.groupId);

    if (await hasLiveOccupancy(tx, members.map((member) => member.id))) {
      return { ok: false, code: "OCCUPIED" };
    }

    if (input.enabled) {
      const validation = validateFullTablePair(members);
      if (!validation.ok) {
        return { ok: false, code: "INVALID_PAIR", problems: validation.problems };
      }
    }

    const type = input.enabled ? "full_table" : "visual_group";
    await tx
      .update(standGroups)
      .set({ type, updatedAt: new Date() })
      .where(eq(standGroups.id, input.groupId));

    return { ok: true, groupId: input.groupId, type };
  });
}
