import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { utcTimestamp } from "@/app/lib/programs/sql-time";

import {
  activeBanSanctionIds,
  resolveBuyerEligibility,
  type EligibilityFacts,
  type EligibilityProfile,
  type EligibilitySnapshot,
  type ParticipantEligibility,
} from "@/app/lib/programs/eligibility";
import { db } from "@/db";
import { sanctions } from "@/db/schema";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type EligibilityExecutor = typeof db | DbTx;

/**
 * Loads the sanction facts the pure eligibility rule needs.
 *
 * Unlike `getReservationEligibility`, this ignores festival scope: a program may
 * have no festival at all, so any ban in effect disqualifies. `reservation_delay`
 * and `warning` sanctions never affect programs eligibility.
 */
export async function fetchEligibilityFacts(
  userId: number,
  options: { now?: Date } = {},
  executor: EligibilityExecutor = db,
): Promise<EligibilityFacts> {
  const now = options.now ?? new Date();

  const bans = await executor
    .select({
      id: sanctions.id,
      status: sanctions.status,
      startsAt: sanctions.startsAt,
      endsAt: sanctions.endsAt,
    })
    .from(sanctions)
    .where(
      and(
        eq(sanctions.userId, userId),
        eq(sanctions.type, "ban"),
        inArray(sanctions.status, ["active", "scheduled"]),
        // Both bounds go through `utcTimestamp`: a bare `Date` parameter is
        // compared in the process's local zone against a UTC wall-clock column,
        // which shifts every boundary by the server's offset.
        sql`${sanctions.startsAt} <= ${utcTimestamp(now)}`,
        or(
          isNull(sanctions.endsAt),
          sql`${sanctions.endsAt} > ${utcTimestamp(now)}`,
        ),
      ),
    );

  return { activeBanSanctionIds: activeBanSanctionIds(bans, now) };
}

/**
 * Authoritative buyer eligibility for the paid programs domain, with the
 * evidence to persist on the purchase. Pass `null` for guests — they carry no
 * profile and no sanctions, so no query is issued.
 */
export async function getBuyerEligibility(
  profile: EligibilityProfile | null | undefined,
  options: { now?: Date } = {},
  executor: EligibilityExecutor = db,
): Promise<{
  eligibility: ParticipantEligibility;
  snapshot: EligibilitySnapshot;
}> {
  const now = options.now ?? new Date();

  if (!profile) {
    return resolveBuyerEligibility(null, { activeBanSanctionIds: [] }, now);
  }

  const facts = await fetchEligibilityFacts(profile.id, { now }, executor);

  return resolveBuyerEligibility(profile, facts, now);
}
