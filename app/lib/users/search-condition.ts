import { eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { users } from "@/db/schema";

/**
 * Matches a person by name, email or `#id`, the way admins look people up
 * across the dashboard. Undefined for a blank term, so callers can pass it
 * straight to `and()`.
 */
export function userSearchCondition(query: string): SQL | undefined {
  const term = query.trim();
  if (!term) return undefined;
  const pattern = `%${term}%`;
  const conditions: SQL[] = [
    ilike(users.displayName, pattern),
    ilike(users.firstName, pattern),
    ilike(users.lastName, pattern),
    ilike(users.email, pattern),
    sql`concat_ws(' ', ${users.firstName}, ${users.lastName}) ilike ${pattern}`,
  ];
  // An id is what the rest of the dashboard shows next to a person, so it is
  // worth finding someone by it.
  const id = Number(term.replace(/^#/, ""));
  if (Number.isInteger(id) && id > 0 && id <= 2_147_483_647) {
    conditions.push(eq(users.id, id));
  }
  return or(...conditions);
}
