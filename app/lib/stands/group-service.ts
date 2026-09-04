import "server-only";

import { inArray } from "drizzle-orm";

import { db } from "@/db";
import { standGroups, stands } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Drops groups that no longer have at least two members.
 *
 * Any command that moves a stand out of a group has to run this, so it lives
 * here rather than inside one of them: a one-member group is invisible on the
 * map and would silently outlive whatever created it.
 */
export async function pruneEmptyGroups(tx: DbTx, groupIds: number[]) {
  if (groupIds.length === 0) return;
  const remaining = await tx
    .select({ id: stands.id, standGroupId: stands.standGroupId })
    .from(stands)
    .where(inArray(stands.standGroupId, groupIds));

  const counts = new Map<number, number>();
  for (const row of remaining) {
    if (row.standGroupId == null) continue;
    counts.set(row.standGroupId, (counts.get(row.standGroupId) ?? 0) + 1);
  }

  const stale = groupIds.filter((id) => (counts.get(id) ?? 0) < 2);
  if (stale.length === 0) return;

  // The stands FK is ON DELETE SET NULL, so the last member is released here.
  await tx.delete(standGroups).where(inArray(standGroups.id, stale));
}
