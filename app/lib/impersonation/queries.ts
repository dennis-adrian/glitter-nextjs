import "server-only";

import {
  and,
  desc,
  eq,
  getTableColumns,
  gt,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { BaseProfile } from "@/app/api/users/definitions";
import {
  IMPERSONATION_DURATION_MINUTES,
  type ImpersonationSessionState,
  type RecentImpersonation,
} from "@/app/lib/impersonation/definitions";
import { hasPendingDeletion } from "@/app/lib/notifications/push/devices";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { db } from "@/db";
import { impersonationSessions, users } from "@/db/schema";

// Lookups and writes for "Entrar como participante". None of these checks who
// is asking: the viewer module and the actions authorize first, then call in.
//
// Every "is it still on" comparison runs against the database's own clock.
// The columns are `timestamp` without a zone, like the rest of the schema, so
// comparing them with the server's `Date` would drift by the offset between
// the two whenever their zones differ.

type Executor = Pick<typeof db, "select" | "insert" | "update">;

export type ImpersonationSessionRow = typeof impersonationSessions.$inferSelect;

const admins = alias(users, "impersonation_admin");
const subjects = alias(users, "impersonation_subject");

const isLive = and(
  isNull(impersonationSessions.endedAt),
  gt(impersonationSessions.expiresAt, sql`now()`),
) as SQL;

/** The state a row reads as now, by the database's clock. */
const stateSql = sql<ImpersonationSessionState>`case
  when ${impersonationSessions.endedAt} is not null then ${impersonationSessions.endReason}::text
  when ${impersonationSessions.expiresAt} <= now() then 'expired'
  else 'active'
end`;

/** Until the end, the hour running out, or now while it is still on. */
const durationSecondsSql = sql<number>`greatest(0, floor(extract(epoch from (
  coalesce(${impersonationSessions.endedAt}, least(${impersonationSessions.expiresAt}, now()))
  - ${impersonationSessions.startedAt}
))))::int`;

export type CreateImpersonationSessionInput = {
  adminUserId: number;
  adminClerkId: string;
  subjectUserId: number;
  subjectClerkId: string;
  adminClerkSessionId: string;
  tokenHash: string;
  returnTo: string | null;
};

/** Opens a view that ends on its own `IMPERSONATION_DURATION_MINUTES` later. */
export async function createImpersonationSession(
  input: CreateImpersonationSessionInput,
  executor: Executor = db,
) {
  const [row] = await executor
    .insert(impersonationSessions)
    .values({
      ...input,
      startedAt: sql`now()`,
      expiresAt: sql`now() + make_interval(mins => ${IMPERSONATION_DURATION_MINUTES})`,
    })
    .returning({
      id: impersonationSessions.id,
      startedAt: impersonationSessions.startedAt,
      expiresAt: impersonationSessions.expiresAt,
    });
  return row;
}

export type LiveImpersonation = {
  session: ImpersonationSessionRow;
  admin: BaseProfile;
  subject: BaseProfile;
  /** Seconds left by the database's clock, for the banner's countdown. */
  secondsLeft: number;
};

/**
 * The view a cookie's token opens, only while every condition still holds:
 * not ended, not expired, bound to this Clerk session, the admin still a
 * global admin, and the subject still a participant. Each profile is matched
 * by the Clerk id recorded at the start too, so a row whose profile was
 * replaced never resolves to someone else.
 *
 * Re-checking the subject's role matters: someone promoted to staff mid-view
 * would otherwise open the admin pages to the session viewing as them.
 */
export async function findLiveImpersonation(
  {
    tokenHash,
    adminClerkSessionId,
  }: { tokenHash: string; adminClerkSessionId: string },
  executor: Pick<typeof db, "select"> = db,
): Promise<LiveImpersonation | null> {
  const [row] = await executor
    .select({
      session: getTableColumns(impersonationSessions),
      admin: getTableColumns(admins),
      subject: getTableColumns(subjects),
      secondsLeft: sql<number>`greatest(0, floor(extract(epoch from (${impersonationSessions.expiresAt} - now()))))::int`,
    })
    .from(impersonationSessions)
    .innerJoin(admins, eq(admins.id, impersonationSessions.adminUserId))
    .innerJoin(subjects, eq(subjects.id, impersonationSessions.subjectUserId))
    .where(
      and(
        eq(impersonationSessions.tokenHash, tokenHash),
        eq(impersonationSessions.adminClerkSessionId, adminClerkSessionId),
        isLive,
        eq(admins.clerkId, impersonationSessions.adminClerkId),
        eq(admins.role, "admin"),
        eq(subjects.clerkId, impersonationSessions.subjectClerkId),
        eq(subjects.role, "user"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The row a token names while it has not been ended, expired or not and
 * whatever session it is bound to, with its state by the database's clock.
 * For leaving: the exit and the stale-cookie cleanup decide what to do with it.
 */
export async function findOpenImpersonationSession(
  tokenHash: string,
  executor: Pick<typeof db, "select"> = db,
) {
  const [row] = await executor
    .select({
      ...getTableColumns(impersonationSessions),
      state: stateSql,
    })
    .from(impersonationSessions)
    .where(
      and(
        eq(impersonationSessions.tokenHash, tokenHash),
        isNull(impersonationSessions.endedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Closes a view that is still on. One that already ran out is left alone, so
 * it keeps reading as expired rather than as an exit that never happened.
 * True when this call is the one that ended it.
 */
export async function endImpersonationSession(
  { id, reason }: { id: number; reason: "exited" | "signed_out" },
  executor: Executor = db,
): Promise<boolean> {
  const ended = await executor
    .update(impersonationSessions)
    .set({ endedAt: sql`now()`, endReason: reason })
    .where(and(eq(impersonationSessions.id, id), isLive))
    .returning({ id: impersonationSessions.id });
  return ended.length > 0;
}

/** Counts one write the read-only guard refused during the view. */
export async function recordBlockedImpersonationWrite(
  id: number,
  executor: Executor = db,
) {
  await executor
    .update(impersonationSessions)
    .set({ blockedWrites: sql`${impersonationSessions.blockedWrites} + 1` })
    .where(eq(impersonationSessions.id, id));
}

const RECENT_LIMIT_MAX = 50;

/**
 * "Recientes": the latest views one admin made, or the latest views of one
 * person's account, newest first.
 */
export async function listRecentImpersonations(
  filter: { adminUserId: number } | { subjectUserId: number },
  limit = 10,
  executor: Pick<typeof db, "select"> = db,
): Promise<RecentImpersonation[]> {
  const where =
    "adminUserId" in filter
      ? eq(impersonationSessions.adminUserId, filter.adminUserId)
      : eq(impersonationSessions.subjectUserId, filter.subjectUserId);
  const person = (table: typeof admins | typeof subjects) => ({
    id: table.id,
    displayName: table.displayName,
    firstName: table.firstName,
    lastName: table.lastName,
    email: table.email,
    imageUrl: table.imageUrl,
  });

  const rows = await executor
    .select({
      id: impersonationSessions.id,
      state: stateSql,
      startedAt: impersonationSessions.startedAt,
      durationSeconds: durationSecondsSql,
      blockedWrites: impersonationSessions.blockedWrites,
      admin: person(admins),
      subject: person(subjects),
    })
    .from(impersonationSessions)
    .leftJoin(admins, eq(admins.id, impersonationSessions.adminUserId))
    .leftJoin(subjects, eq(subjects.id, impersonationSessions.subjectUserId))
    .where(where)
    .orderBy(
      desc(impersonationSessions.startedAt),
      desc(impersonationSessions.id),
    )
    .limit(Math.min(Math.max(1, Math.trunc(limit)), RECENT_LIMIT_MAX));

  // A left join with no match yields an object of nulls, not null.
  return rows.map((row) => ({
    ...row,
    admin: row.admin?.id != null ? row.admin : null,
    subject: row.subject?.id != null ? row.subject : null,
  })) as RecentImpersonation[];
}

/** What the start action needs to know about whoever was picked. */
export async function loadImpersonationTarget(
  subjectId: number,
  executor: Pick<typeof db, "select"> = db,
): Promise<{ subject: BaseProfile | null; pendingDeletion: boolean }> {
  const [subject] = await executor
    .select()
    .from(users)
    .where(eq(users.id, subjectId))
    .limit(1);
  if (!subject) return { subject: null, pendingDeletion: false };
  return {
    subject,
    pendingDeletion: await hasPendingDeletion(subject.id, executor),
  };
}

export type ImpersonationCandidate = Pick<
  BaseProfile,
  | "id"
  | "displayName"
  | "firstName"
  | "lastName"
  | "email"
  | "imageUrl"
  | "status"
  | "category"
>;

const SEARCH_LIMIT = 20;

/**
 * The picker's search: participants matching a name, email or `#id`, the way
 * admins look people up across the dashboard (`userSearchCondition`). Staff
 * accounts never appear, since they cannot be viewed as. Nothing for a blank
 * term, so the picker opens on its recent views rather than on everyone.
 */
export async function searchImpersonationCandidates(
  query: string,
  executor: Pick<typeof db, "select"> = db,
): Promise<ImpersonationCandidate[]> {
  const condition = userSearchCondition(query);
  if (!condition) return [];
  return executor
    .select({
      id: users.id,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      imageUrl: users.imageUrl,
      status: users.status,
      category: users.category,
    })
    .from(users)
    .where(and(eq(users.role, "user"), condition))
    .orderBy(
      sql`lower(coalesce(${users.displayName}, ${users.firstName}, ${users.email}))`,
      users.id,
    )
    .limit(SEARCH_LIMIT);
}
