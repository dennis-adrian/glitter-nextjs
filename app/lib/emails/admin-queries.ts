import "server-only";

import {
  and,
  asc,
  count,
  desc,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import type {
  EmailAdminActor,
  EmailAdminCounts,
  EmailAdminPage,
  EmailAdminRow,
  EmailAdminSearchParams,
  EmailPerson,
} from "@/app/lib/emails/admin-definitions";
import { buildSearchPattern } from "@/app/lib/programs/search";
import { getUserName } from "@/app/lib/users/utils";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  emailSuppressions,
  emailUnsubscribes,
  users,
  visitors,
} from "@/db/schema";

/**
 * Matches an address by itself or by the name of someone it belongs to, so
 * an admin can find "Camila" without knowing her address.
 */
function searchCondition(column: SQL, query: string) {
  if (!query) return undefined;
  const pattern = buildSearchPattern(query.toLowerCase());
  return sql`(
    ${column} like ${pattern}
    or ${column} in (
      select lower(trim(${visitors.email})) from ${visitors}
      where lower(concat_ws(' ', ${visitors.firstName}, ${visitors.lastName})) like ${pattern}
    )
    or ${column} in (
      select lower(trim(${users.email})) from ${users}
      where lower(concat_ws(' ', ${users.displayName}, ${users.firstName}, ${users.lastName})) like ${pattern}
    )
  )`;
}

async function fetchCounts(): Promise<EmailAdminCounts> {
  const [suppressions, [unsubscribed]] = await Promise.all([
    db
      .select({
        reason: emailSuppressions.reason,
        lifted: sql<boolean>`${emailSuppressions.liftedAt} is not null`,
        total: count(),
      })
      .from(emailSuppressions)
      .groupBy(
        emailSuppressions.reason,
        sql`${emailSuppressions.liftedAt} is not null`,
      ),
    db.select({ total: count() }).from(emailUnsubscribes),
  ]);
  const counts: EmailAdminCounts = {
    bounced: 0,
    complained: 0,
    unsubscribed: unsubscribed?.total ?? 0,
    lifted: 0,
  };
  for (const row of suppressions) {
    if (row.lifted) counts.lifted += row.total;
    else if (row.reason === "complaint") counts.complained += row.total;
    else counts.bounced += row.total;
  }
  return counts;
}

/** Who each address on the page belongs to: visitors and accounts. */
async function peopleFor(keys: string[]) {
  const people = new Map<string, EmailPerson[]>();
  if (keys.length === 0) return people;
  const add = (key: string, person: EmailPerson) => {
    const list = people.get(key) ?? [];
    list.push(person);
    people.set(key, list);
  };

  const [accountRows, visitorRows] = await Promise.all([
    db
      .select({
        key: sql<string>`lower(trim(${users.email}))`,
        id: users.id,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(sql`lower(trim(${users.email}))`, keys)),
    // One visitor per address: case variants of it are the same person.
    db
      .selectDistinctOn([sql`lower(trim(${visitors.email}))`], {
        key: sql<string>`lower(trim(${visitors.email}))`,
        firstName: visitors.firstName,
        lastName: visitors.lastName,
      })
      .from(visitors)
      .where(inArray(sql`lower(trim(${visitors.email}))`, keys))
      .orderBy(sql`lower(trim(${visitors.email}))`, asc(visitors.id)),
  ]);

  for (const row of accountRows) {
    add(row.key, { kind: "user", id: row.id, name: getUserName(row) || null });
  }
  for (const row of visitorRows) {
    const name = [row.firstName, row.lastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(" ");
    add(row.key, { kind: "visitor", name: name || null });
  }
  return people;
}

async function actorsFor(ids: (number | null)[]) {
  const unique = [...new Set(ids.filter((id): id is number => id !== null))];
  const actors = new Map<number, EmailAdminActor>();
  if (unique.length === 0) return actors;
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, unique));
  for (const row of rows) {
    actors.set(row.id, { id: row.id, name: getUserName(row) || row.email });
  }
  return actors;
}

/**
 * One page of the admin list, with the counts for its tabs. Null for anyone
 * but an admin: the list is every address that asked us to stop mailing it.
 */
export async function fetchEmailAdminPage(
  params: EmailAdminSearchParams,
): Promise<EmailAdminPage | null> {
  if (!(await requireAdmin())) return null;
  const { tab, query, limit, offset } = params;

  if (tab === "unsubscribed") {
    const where = searchCondition(sql`${emailUnsubscribes.emailKey}`, query);
    const [rows, [{ total }], counts] = await Promise.all([
      db
        .select()
        .from(emailUnsubscribes)
        .where(where)
        .orderBy(desc(emailUnsubscribes.createdAt), desc(emailUnsubscribes.id))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(emailUnsubscribes).where(where),
      fetchCounts(),
    ]);
    const [people, actors] = await Promise.all([
      peopleFor(rows.map((row) => row.emailKey)),
      actorsFor(rows.map((row) => row.createdByUserId)),
    ]);
    return {
      total,
      counts,
      rows: rows.map(
        (row): EmailAdminRow => ({
          kind: "unsubscribed",
          emailKey: row.emailKey,
          people: people.get(row.emailKey) ?? [],
          topic: row.topic,
          unsubscribedAt: row.createdAt,
          createdBy:
            row.createdByUserId === null
              ? null
              : (actors.get(row.createdByUserId) ?? null),
        }),
      ),
    };
  }

  const lifted = tab === "lifted";
  const where = and(
    lifted
      ? isNotNull(emailSuppressions.liftedAt)
      : isNull(emailSuppressions.liftedAt),
    searchCondition(sql`${emailSuppressions.emailKey}`, query),
  );
  const order = lifted
    ? [desc(emailSuppressions.liftedAt), desc(emailSuppressions.id)]
    : [
        desc(
          sql`coalesce(${emailSuppressions.lastEventAt}, ${emailSuppressions.createdAt})`,
        ),
        desc(emailSuppressions.id),
      ];
  const [rows, [{ total }], counts] = await Promise.all([
    db
      .select()
      .from(emailSuppressions)
      .where(where)
      .orderBy(...order)
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(emailSuppressions).where(where),
    fetchCounts(),
  ]);
  const [people, actors] = await Promise.all([
    peopleFor(rows.map((row) => row.emailKey)),
    actorsFor(rows.map((row) => row.liftedByUserId)),
  ]);

  return {
    total,
    counts,
    rows: rows.map((row): EmailAdminRow => {
      const base = {
        emailKey: row.emailKey,
        people: people.get(row.emailKey) ?? [],
        reason: row.reason,
        detail: row.detail,
      };
      return lifted
        ? {
            ...base,
            kind: "lifted",
            liftedAt: row.liftedAt ?? row.updatedAt,
            liftedBy:
              row.liftedByUserId === null
                ? null
                : (actors.get(row.liftedByUserId) ?? null),
          }
        : {
            ...base,
            kind: "blocked",
            blockedAt: row.lastEventAt ?? row.createdAt,
          };
    }),
  };
}
