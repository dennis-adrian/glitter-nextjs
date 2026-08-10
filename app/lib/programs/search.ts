/**
 * Pure helpers for enrollment search.
 *
 * Split from `purchase-queries.ts` for the same reason as `review.ts` and
 * `support.ts`: that module is `server-only`, and these rules are worth testing
 * without a database.
 */

/**
 * Escapes the characters `LIKE`/`ILIKE` treats as wildcards.
 *
 * Without this, an admin searching for `maria_lopez@…` gets `_` interpreted as
 * "any single character", and a stray `%` matches every enrollment in the
 * table. Neither is a security hole — the value is always a bound parameter —
 * but both silently return the wrong rows.
 *
 * Backslash is Postgres' default escape character for `LIKE`/`ILIKE`, so no
 * explicit `ESCAPE` clause is needed. The three characters are replaced in a
 * single pass so an escaped backslash is not re-escaped.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

/** A contains-match pattern with the user's wildcards neutralized. */
export function buildSearchPattern(query: string): string {
  return `%${escapeLikePattern(query)}%`;
}

export type SearchableTicket = {
  attendeeName: string;
  attendeeEmail: string;
  code: string;
};

/**
 * Whether this specific ticket is the one the query found.
 *
 * The search matches across a purchase's lines, so a purchase can come back
 * because of a ticket that is not its first. Showing the first one would then
 * answer a search for one attendee — or one ticket code — with a different
 * person's name.
 *
 * Case-insensitive substring, mirroring the `ILIKE '%…%'` the SQL side uses.
 */
export function ticketMatchesQuery(
  ticket: SearchableTicket,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;

  return (
    ticket.attendeeName.toLowerCase().includes(needle) ||
    ticket.attendeeEmail.toLowerCase().includes(needle) ||
    ticket.code.toLowerCase().includes(needle)
  );
}
