import { eq, sql } from "drizzle-orm";

import {
  programs,
  programSessions,
  sessionOccurrences,
  venues,
} from "@/db/schema";

/**
 * SQL twin of `resolveEffectiveVenueId`: the occurrence's venue, else the
 * session's, else the program default. PRD §5.2.
 *
 * Checkout and free registration resolve the venue in code; every query that
 * joins a venue name for an occurrence must go through this instead of
 * `sessionOccurrences.venueId`, or an occurrence that inherits its venue
 * reaches the buyer with no location at all.
 *
 * Only valid in a query that joins all three tables unaliased. A function, not
 * a shared constant, because drizzle's `SQL` is mutable (`mapWith`,
 * `inlineParams`) and one caller must not be able to change another's query.
 */
export function effectiveVenueIdSql() {
  return sql<
    number | null
  >`coalesce(${sessionOccurrences.venueId}, ${programSessions.venueId}, ${programs.defaultVenueId})`;
}

/** `leftJoin(venues, effectiveVenueJoin())`: the effective venue's row. */
export function effectiveVenueJoin() {
  return eq(venues.id, effectiveVenueIdSql());
}
