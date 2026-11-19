import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { isSuppressed } from "@/app/lib/emails/suppressions";
import { isUniqueViolationOn } from "@/app/lib/errors/postgres";
import { hasPendingDeletion } from "@/app/lib/notifications/push/devices";
import { normalizeEmail } from "@/app/lib/users/email-change-definitions";
import { db } from "@/db";
import {
  disciplinaryNotificationJobs,
  emailUnsubscribes,
  notificationDeliveries,
  reservationNotificationJobs,
  userEmailChanges,
  users,
} from "@/db/schema";

/**
 * The database half of "Cambiar correo". Clerk changes between `begin` and
 * `complete`, outside any transaction, so each takes the caller's transaction
 * and answers with a result instead of throwing: the action has to tell an
 * admin what happened either way.
 */

type EmailChangeTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const USERS_EMAIL_UNIQUE = "users_email_unique";
const TICKET_EMAIL_UNIQUE = "session_tickets_occurrence_attendee_email_idx";
export const EMAIL_TAKEN_ERROR = `sqlstate=23505 constraint=${USERS_EMAIL_UNIQUE}`;

/**
 * Opt-outs that belong to a person with an account, so they follow them to the
 * new address. `visitor_invitations` and `news` are about the mailbox as a
 * visitor or guest buyer and stay behind.
 */
const ACCOUNT_TOPICS = [
  "all",
  "announcements",
  "participant_invitations",
] as const;

/**
 * How long an unfinished change keeps another from starting. Nothing renews
 * it, so the Clerk half has to be done writing before it runs out.
 *
 * Clerk has no conditional writes, so a request still on its way at the
 * Clerk deadline is not fenced off by anything here. The platform does it:
 * vercel.json stops every function at maxDuration (100 s), with whatever
 * request it still had open, and this window is longer by a margin, so a
 * newer attempt only begins once the older one cannot write any more.
 * email-changes.test.ts holds the two to that. A run that stopped with a
 * failure frees the window at once only when nothing it sent can still land.
 */
export const EMAIL_CHANGE_WINDOW_MS = 2 * 60_000;
/** The Clerk half's share of the window; the rest is margin for a slow call. */
export const EMAIL_CHANGE_CLERK_BUDGET_MS = EMAIL_CHANGE_WINDOW_MS - 30_000;

/**
 * Failures after which a Clerk write may still land: the outcome of a request
 * was never seen, or Clerk did not show what was asked. Any `change_failed:`
 * (Clerk threw) is one too.
 */
export const WRITE_MAY_LAND = [
  "clerk_unconfirmed",
  "clerk_failed: deadline_unconfirmed",
] as const;

/** Mail not yet sent for good: queued, or held by a worker that may fail. */
const IN_FLIGHT = ["pending", "processing"] as const;

export type BeginEmailChangeResult =
  | { status: "not_found" }
  | { status: "deletion_pending" }
  | { status: "in_progress" }
  | { status: "email_taken" }
  | { status: "suppressed" }
  | {
      status: "ok";
      /**
       * The profile already has this address: only Clerk may have something
       * left to tidy, and nobody is told unless `owedNotices` says otherwise.
       */
      resync: boolean;
      /**
       * On a resync, the change that brought the profile to this address when
       * its notices were never attempted: that run died after its commit.
       * They are sent for that row, to the address it moved the person from.
       */
      owedNotices: { changeId: number; oldEmail: string } | null;
      /**
       * On a resync, the address that change moved the person from. Clerk may
       * still hold a connected account of it that nothing else names.
       */
      arrivedFrom: string | null;
      changeId: number;
      /**
       * This server's clock (epoch ms) just before the reservation row was
       * written. The window is counted from the row, which is written later,
       * so a deadline counted from here can only fall short of its end.
       */
      reservedAt: number;
      clerkId: string;
      /** As stored, read under the lock: where the old-address notice goes. */
      oldEmail: string;
      displayName: string | null;
      firstName: string | null;
      lastName: string | null;
    };

export type CompleteEmailChangeResult =
  | { status: "ok" }
  | { status: "user_gone" }
  | { status: "deletion_pending" }
  | { status: "email_taken" }
  /** A newer change for the same profile started: this one writes nothing. */
  | { status: "superseded" };

/** Another profile already holds `email`, in any letter case. */
async function emailBelongsToAnother(
  tx: EmailChangeTx,
  userId: number,
  email: string,
) {
  // The unique constraint is case-sensitive and nothing normalizes the column
  // on sign-up, so "Ana@x.com" would not stop "ana@x.com".
  const [other] = await tx
    .select({ id: users.id })
    .from(users)
    .where(
      and(ne(users.id, userId), sql`lower(trim(${users.email})) = ${email}`),
    )
    .limit(1);
  return other != null;
}

/**
 * Checks that the change can go ahead and records the intent. Runs under the
 * user lock, the one profile deletion takes before creating its pending row,
 * so a deletion either committed before this or sees the new address later.
 */
export async function beginEmailChange(
  tx: EmailChangeTx,
  input: { userId: number; newEmail: string; actorId: number },
): Promise<BeginEmailChangeResult> {
  const newEmail = normalizeEmail(input.newEmail);

  const [user] = await tx
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)
    .for("update");
  if (!user) return { status: "not_found" };

  // Clerk may already have deleted the account.
  if (await hasPendingDeletion(user.id, tx)) {
    return { status: "deletion_pending" };
  }
  // Two runs at once would each read Clerk before the other wrote. A row that
  // failed or is older than any run can be says nothing is in flight. The wall
  // clock on both sides: now() is when the transaction began, and a wait for
  // the lock above would age the reservation before it existed.
  const [inFlight] = await tx
    .select({ id: userEmailChanges.id })
    .from(userEmailChanges)
    .where(
      and(
        eq(userEmailChanges.userId, user.id),
        isNull(userEmailChanges.completedAt),
        or(
          isNull(userEmailChanges.lastError),
          // Failed, but a write it sent may still land: it holds the window
          // as long as a run that is still going would.
          inArray(userEmailChanges.lastError, [...WRITE_MAY_LAND]),
          like(userEmailChanges.lastError, "change_failed:%"),
        ),
        sql`${userEmailChanges.createdAt} > clock_timestamp() - ${EMAIL_CHANGE_WINDOW_MS} * interval '1 millisecond'`,
      ),
    )
    .limit(1);
  if (inFlight) return { status: "in_progress" };

  if (await emailBelongsToAnother(tx, user.id, newEmail)) {
    return { status: "email_taken" };
  }
  // Repeating the current address is how an admin clears what an earlier
  // change left behind in Clerk.
  const resync = normalizeEmail(user.email) === newEmail;
  // Every notify() email to a suppressed address is skipped, and Resend drops
  // the rest: the person would stop hearing from us, starting with the notice.
  // On a resync the address is already theirs, so there is nothing to protect.
  if (!resync && (await isSuppressed(newEmail, tx))) {
    // Unless Clerk already signs them in with it: an earlier run stopped
    // before the profile followed, and refusing would leave it behind for as
    // long as the suppression stands. Only the very last attempt says what
    // Clerk holds: any later one, even one that recorded nothing, may have
    // written there, and then lifting the suppression is the way out.
    const [last] = await tx
      .select({
        oldEmail: userEmailChanges.oldEmail,
        newEmail: userEmailChanges.newEmail,
        clerkChangedAt: userEmailChanges.clerkChangedAt,
        completedAt: userEmailChanges.completedAt,
      })
      .from(userEmailChanges)
      .where(eq(userEmailChanges.userId, user.id))
      .orderBy(desc(userEmailChanges.id))
      .limit(1);
    const halfDone =
      last != null &&
      last.clerkChangedAt != null &&
      last.completedAt == null &&
      last.newEmail === newEmail &&
      last.oldEmail === user.email;
    if (!halfDone) return { status: "suppressed" };
  }

  let owedNotices: { changeId: number; oldEmail: string } | null = null;
  let arrivedFrom: string | null = null;
  if (resync) {
    // The change that last brought the profile here, resyncs aside. Only that
    // one: an older move to the same address is not news any more.
    const [arrival] = await tx
      .select({
        id: userEmailChanges.id,
        oldEmail: userEmailChanges.oldEmail,
        oldNoticeStatus: userEmailChanges.oldNoticeStatus,
        newNoticeStatus: userEmailChanges.newNoticeStatus,
      })
      .from(userEmailChanges)
      .where(
        and(
          eq(userEmailChanges.userId, user.id),
          eq(userEmailChanges.newEmail, newEmail),
          sql`lower(trim(${userEmailChanges.oldEmail})) <> ${newEmail}`,
          isNotNull(userEmailChanges.completedAt),
        ),
      )
      .orderBy(desc(userEmailChanges.id))
      .limit(1);
    arrivedFrom = arrival?.oldEmail ?? null;
    if (
      arrival &&
      arrival.oldNoticeStatus == null &&
      arrival.newNoticeStatus == null
    ) {
      owedNotices = { changeId: arrival.id, oldEmail: arrival.oldEmail };
    }
  }

  // Before the insert: the row's own timestamp is taken after this.
  const reservedAt = Date.now();
  const [change] = await tx
    .insert(userEmailChanges)
    .values({
      userId: user.id,
      clerkId: user.clerkId,
      oldEmail: user.email,
      newEmail,
      changedByUserId: input.actorId,
      createdAt: sql`clock_timestamp()`,
    })
    .returning({ id: userEmailChanges.id });

  return {
    status: "ok",
    resync,
    owedNotices,
    arrivedFrom,
    changeId: change.id,
    reservedAt,
    clerkId: user.clerkId,
    oldEmail: user.email,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/**
 * Makes the database follow Clerk: the profile's address, the mail already
 * queued for the person, and their opt-outs. Clerk has changed by the time
 * this runs, so a refusal is recorded on the audit row and returned, and the
 * transaction still commits.
 */
export async function completeEmailChange(
  tx: EmailChangeTx,
  input: {
    changeId: number;
    userId: number;
    oldEmail: string;
    newEmail: string;
    unlinkedProviders: string[];
  },
): Promise<CompleteEmailChangeResult> {
  const { changeId, userId, unlinkedProviders } = input;
  const newEmail = normalizeEmail(input.newEmail);

  const stamp = (values: { lastError: string | null; completed: boolean }) =>
    tx
      .update(userEmailChanges)
      .set({
        unlinkedProviders,
        clerkChangedAt: sql`coalesce(${userEmailChanges.clerkChangedAt}, now())`,
        completedAt: values.completed ? sql`now()` : null,
        lastError: values.lastError,
        updatedAt: sql`now()`,
      })
      .where(eq(userEmailChanges.id, changeId));

  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  if (!user) {
    await stamp({ lastError: "user_gone", completed: false });
    return { status: "user_gone" };
  }
  // The reservation ran out and a newer change began: the profile and the
  // queues are that one's to write, and this address may no longer be Clerk's.
  const [newer] = await tx
    .select({ id: userEmailChanges.id })
    .from(userEmailChanges)
    .where(
      and(
        eq(userEmailChanges.userId, userId),
        gt(userEmailChanges.id, changeId),
      ),
    )
    .limit(1);
  if (newer) {
    await stamp({ lastError: "superseded", completed: false });
    return { status: "superseded" };
  }
  // A deletion that started while Clerk was being changed owns the row now.
  if (await hasPendingDeletion(userId, tx)) {
    await stamp({ lastError: "deletion_pending", completed: false });
    return { status: "deletion_pending" };
  }
  if (await emailBelongsToAnother(tx, userId, newEmail)) {
    await stamp({ lastError: "email_taken", completed: false });
    return { status: "email_taken" };
  }

  try {
    // A savepoint: a unique violation would otherwise abort the transaction
    // and take the note of why with it.
    await tx.transaction((savepoint) =>
      savepoint
        .update(users)
        .set({ email: newEmail, updatedAt: new Date() })
        .where(eq(users.id, userId)),
    );
  } catch (error) {
    if (!isUniqueViolationOn(error, (name) => name === USERS_EMAIL_UNIQUE)) {
      throw error;
    }
    await stamp({ lastError: EMAIL_TAKEN_ERROR, completed: false });
    return { status: "email_taken" };
  }

  // Each outbox froze the address when the mail was queued. Rows a worker
  // holds move too: it has already read its copy, but a send that fails puts
  // the row back to pending with whatever address it carries. Finished rows
  // are history.

  // Deduplication keys are left alone, though the default reservation key
  // carries the address: rewriting one could collide with a key already
  // there, and would not cover rows already sent, which keep the old address
  // too. So a notification enqueued again after the change is not
  // deduplicated against one queued before it.

  // The drain tells the owner from an admin by comparing this address with the
  // profile's, so a stale one sends the wrong template or fails the job.
  await tx
    .update(reservationNotificationJobs)
    .set({ recipientEmail: newEmail, updatedAt: sql`now()` })
    .where(
      and(
        eq(reservationNotificationJobs.userId, userId),
        inArray(reservationNotificationJobs.status, [...IN_FLIGHT]),
      ),
    );

  // The send reads `payload.profile.email`, not the column. A payload without
  // a profile is a retry marker that reads the live profile when it runs.
  await tx
    .update(disciplinaryNotificationJobs)
    .set({
      recipientEmail: newEmail,
      payload: sql`jsonb_set(${disciplinaryNotificationJobs.payload}, '{profile,email}', to_jsonb(${newEmail}::text))`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(disciplinaryNotificationJobs.userId, userId),
        inArray(disciplinaryNotificationJobs.status, [...IN_FLIGHT]),
        sql`jsonb_typeof(${disciplinaryNotificationJobs.payload} -> 'profile') = 'object'`,
      ),
    );

  // Bulk rows are tied to a Resend batch and already handle this on their own:
  // the drain fails them as `address_changed` and the admin retries.
  await tx
    .update(notificationDeliveries)
    .set({ recipientEmail: newEmail, updatedAt: sql`now()` })
    .where(
      and(
        eq(notificationDeliveries.userId, userId),
        eq(notificationDeliveries.channel, "email"),
        eq(notificationDeliveries.lane, "transactional"),
        inArray(notificationDeliveries.status, [...IN_FLIGHT]),
      ),
    );

  // Copied, not moved: the old address can still be a visitor or a guest
  // buyer, and whoever reads that mailbox asked not to get this mail.
  const optOuts = await tx
    .select({
      topic: emailUnsubscribes.topic,
      createdByUserId: emailUnsubscribes.createdByUserId,
      createdAt: emailUnsubscribes.createdAt,
    })
    .from(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, normalizeEmail(input.oldEmail)),
        inArray(emailUnsubscribes.topic, [...ACCOUNT_TOPICS]),
      ),
    );
  if (optOuts.length > 0) {
    await tx
      .insert(emailUnsubscribes)
      .values(optOuts.map((optOut) => ({ ...optOut, emailKey: newEmail })))
      .onConflictDoNothing();
  }

  // The ticket's own copy of the address is what the roster and the door
  // search show. A guest ticket for the same occurrence may already hold the
  // new one; that ticket keeps the old address rather than break the
  // one-seat-per-address index. The day-of reminder is not affected: for a
  // ticket with an account it reads the profile.
  try {
    // A savepoint: the check cannot see a guest checkout that has not
    // committed, and its violation must not undo the change Clerk already has.
    await tx.transaction((savepoint) =>
      savepoint.execute(sql`
        update session_tickets as ticket
        set attendee_email = ${newEmail}, updated_at = now()
        where ticket.attendee_user_id = ${userId}
          and ticket.status = 'valid'
          and not exists (
            select 1 from session_tickets as other
            where other.occurrence_id = ticket.occurrence_id
              and other.id <> ticket.id
              and other.status = 'valid'
              and lower(other.attendee_email) = ${newEmail}
          )
      `),
    );
  } catch (error) {
    if (!isUniqueViolationOn(error, (name) => name === TICKET_EMAIL_UNIQUE)) {
      throw error;
    }
    // The tickets keep the old address, like the one the check skips.
  }

  await stamp({ lastError: null, completed: true });
  return { status: "ok" };
}

/**
 * Clerk has the new address. Recorded on its own, before the database follows,
 * so a row with this set and no `completedAt` says where that run stopped.
 */
export async function markEmailChangeClerkDone(
  changeId: number,
  unlinkedProviders: string[],
) {
  await db
    .update(userEmailChanges)
    .set({
      unlinkedProviders,
      clerkChangedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(userEmailChanges.id, changeId));
}

/** `code` is a step or error code, never a Clerk or driver message. */
export async function markEmailChangeFailed(changeId: number, code: string) {
  await db
    .update(userEmailChanges)
    .set({ lastError: code, updatedAt: sql`now()` })
    .where(eq(userEmailChanges.id, changeId));
}

/** `sent`, or the log-safe type of what made the send fail. */
export async function recordEmailChangeNotices(
  changeId: number,
  notices: { old: string; new: string },
) {
  await db
    .update(userEmailChanges)
    .set({
      oldNoticeStatus: notices.old,
      newNoticeStatus: notices.new,
      updatedAt: sql`now()`,
    })
    .where(eq(userEmailChanges.id, changeId));
}

/**
 * For a profile about to be deleted: the audit keeps who, when and how it
 * ended, and lets go of the addresses. Run before the delete, which nulls
 * `user_id` and with it the way to find these rows.
 */
export async function scrubEmailChangesForUser(
  tx: EmailChangeTx,
  userId: number,
) {
  // Blank, not null: both columns are NOT NULL.
  await tx
    .update(userEmailChanges)
    .set({ oldEmail: "", newEmail: "", updatedAt: sql`now()` })
    .where(eq(userEmailChanges.userId, userId));
}

/**
 * What to keep of an error: the SQLSTATE and constraint when Postgres is
 * behind it, otherwise its class. Driver messages quote the row, address
 * included, and drizzle's carry the query parameters.
 */
export function emailChangeErrorCode(error: unknown): string {
  for (
    let current: unknown = error;
    current && typeof current === "object";
    current = (current as { cause?: unknown }).cause
  ) {
    const { code, constraint } = current as {
      code?: unknown;
      constraint?: unknown;
    };
    // Five characters, and no SQLSTATE class starts with E as Node's do.
    if (typeof code === "string" && /^(?!E)[0-9A-Z]{5}$/.test(code)) {
      return typeof constraint === "string"
        ? `sqlstate=${code} constraint=${constraint}`
        : `sqlstate=${code}`;
    }
  }
  return error instanceof Error ? error.name : typeof error;
}
