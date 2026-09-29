import { eq, sql } from "drizzle-orm";

import type { Venue } from "@/app/lib/programs/definitions";
import { resolveEffectiveVenue } from "@/app/lib/programs/state";
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

/**
 * Relational `with` for an occurrence that loads every venue its effective
 * venue can come from. Pass the result through `withEffectiveVenue`.
 *
 * Booleans pinned with `as const` for drizzle's `DBQueryConfig`; see
 * `sessionWith` in `data.ts`.
 */
export const occurrenceVenueSources = {
  venue: true as const,
  session: {
    with: {
      venue: true as const,
      program: { with: { defaultVenue: true as const } },
    },
  },
};

export type VenueSources = {
  venue: Venue | null;
  session: { venue: Venue | null; program: { defaultVenue: Venue | null } };
};

/**
 * Relational counterpart of `effectiveVenueJoin`: swaps the occurrence's own
 * `venue`, which is only its override, for `effectiveVenue`.
 *
 * The override is dropped rather than kept alongside, so a page that reaches
 * for `occurrence.venue` fails to compile instead of rendering no location
 * for an occurrence that inherits one.
 */
export function withEffectiveVenue<O extends VenueSources>(occurrence: O) {
  const { venue, ...rest } = occurrence;

  return {
    ...rest,
    effectiveVenue: resolveEffectiveVenue(
      venue,
      occurrence.session.venue,
      occurrence.session.program.defaultVenue,
    ),
  };
}
