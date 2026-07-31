import { eq } from "drizzle-orm";

import { BaseProfile } from "@/app/api/users/definitions";
import { users } from "@/db/schema";

/**
 * Canonical source of truth for the paid programs domain: an active participant
 * is a user whose profile status is `verified` and who is not serving an active
 * ban sanction. Nothing else qualifies — not role, not category, not
 * participation type.
 *
 * Every access check, price resolution, and pricing snapshot in this domain must
 * route through this module so the predicate and the SQL condition cannot drift
 * apart. This file stays free of database access; `eligibility-queries.ts` loads
 * the facts it needs, following the convention set by
 * `app/lib/sanctions/reservation-eligibility-logic.ts`.
 *
 * See docs/ARCHITECTURE-paid-programs-and-sessions.md §8.
 */
export const ACTIVE_PARTICIPANT_STATUS = "verified" as const;

/**
 * Bumped whenever the rule above changes, so eligibility snapshots stored on
 * past purchases stay auditable against the definition that produced them.
 *
 * v1: `users.status === "verified"`.
 * v2: v1 and no active ban sanction.
 */
export const ELIGIBILITY_DEFINITION_VERSION = 2;

export type ParticipantEligibility = "active_participant" | "public";

/** Minimal shape needed to decide eligibility. */
export type EligibilityProfile = Pick<BaseProfile, "id" | "status" | "role">;

/**
 * A user's ban sanctions, already narrowed to the rows worth considering.
 * Mirrors the columns `app/lib/sanctions/reservation-eligibility.ts` selects.
 */
export type BanSanctionRow = {
  id: number;
  status: "scheduled" | "active" | "expired" | "revoked";
  startsAt: Date;
  endsAt: Date | null;
};

/**
 * Facts that cannot be read off the profile row. Required rather than optional
 * so no caller can forget to consider sanctions.
 */
export type EligibilityFacts = {
  activeBanSanctionIds: number[];
};

/** Guests carry no sanctions; this spares callers an empty-array literal. */
export const NO_SANCTIONS: EligibilityFacts = { activeBanSanctionIds: [] };

export type EligibilitySnapshot = {
  source: "users.status" | "guest";
  userId: number | null;
  status: BaseProfile["status"] | null;
  role: BaseProfile["role"] | null;
  hasActiveBanSanction: boolean;
  activeBanSanctionIds: number[];
  evaluatedAt: string;
  definitionVersion: number;
};

/**
 * A ban is in effect when it has started, has not ended, and has not been
 * revoked or expired. `scheduled` rows count once their `startsAt` has passed,
 * because the status is advanced by a background process and may lag.
 */
export function isBanInEffect(ban: BanSanctionRow, now: Date): boolean {
  if (ban.status !== "active" && ban.status !== "scheduled") return false;
  if (ban.startsAt.getTime() > now.getTime()) return false;
  if (ban.endsAt && ban.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Ids of the bans currently in effect, in ascending order. */
export function activeBanSanctionIds(
  bans: BanSanctionRow[],
  now: Date = new Date(),
): number[] {
  return bans
    .filter((ban) => isBanInEffect(ban, now))
    .map((ban) => ban.id)
    .sort((a, b) => a - b);
}

/**
 * Paused, banned, rejected, and pending profiles are treated as general public
 * for both access and pricing, as are guests and anyone serving an active ban.
 */
export function isActiveParticipant(
  profile: EligibilityProfile | null | undefined,
  facts: EligibilityFacts,
): boolean {
  if (profile?.status !== ACTIVE_PARTICIPANT_STATUS) return false;
  return facts.activeBanSanctionIds.length === 0;
}

/**
 * The status half of the rule as a query condition, for admin lists and
 * aggregates. Sanctions are not expressible here — callers that must exclude
 * banned users join `sanctions` themselves or filter with
 * `activeBanSanctionIds`.
 */
export function activeParticipantSqlCondition() {
  return eq(users.status, ACTIVE_PARTICIPANT_STATUS);
}

/**
 * Audience modes a session may declare. Phase 1 introduces the matching pgEnum
 * and this alias narrows to it.
 */
export type SessionAudience = "all" | "participants_only" | "public_only";

/**
 * Whether a buyer of the given eligibility may purchase a session with this
 * audience. Called when checkout starts and again inside the confirming
 * transaction — a stale page must not be able to smuggle an ineligible buyer
 * through.
 */
export function canPurchaseAudience(
  audience: SessionAudience,
  eligibility: ParticipantEligibility,
): boolean {
  switch (audience) {
    case "all":
      return true;
    case "participants_only":
      return eligibility === "active_participant";
    case "public_only":
      return eligibility === "public";
  }
}

/**
 * Resolves the buyer's eligibility together with the evidence to persist on the
 * purchase. Pass `null` and `NO_SANCTIONS` for guests and unauthenticated
 * visitors.
 */
export function resolveBuyerEligibility(
  profile: EligibilityProfile | null | undefined,
  facts: EligibilityFacts,
  evaluatedAt: Date = new Date(),
): { eligibility: ParticipantEligibility; snapshot: EligibilitySnapshot } {
  const isParticipant = isActiveParticipant(profile, facts);

  return {
    eligibility: isParticipant ? "active_participant" : "public",
    snapshot: {
      source: profile ? "users.status" : "guest",
      userId: profile?.id ?? null,
      status: profile?.status ?? null,
      role: profile?.role ?? null,
      hasActiveBanSanction: facts.activeBanSanctionIds.length > 0,
      activeBanSanctionIds: facts.activeBanSanctionIds,
      evaluatedAt: evaluatedAt.toISOString(),
      definitionVersion: ELIGIBILITY_DEFINITION_VERSION,
    },
  };
}
