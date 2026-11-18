import { and, eq, inArray, ne, sql } from "drizzle-orm";

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

export type BeginEmailChangeResult =
  | { status: "not_found" }
  | { status: "deletion_pending" }
  | { status: "same_email" }
  | { status: "email_taken" }
  | { status: "suppressed" }
  | {
      status: "ok";
      changeId: number;
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
  | { status: "email_taken" };

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
  if (normalizeEmail(user.email) === newEmail) return { status: "same_email" };
  if (await emailBelongsToAnother(tx, user.id, newEmail)) {
    return { status: "email_taken" };
  }
  // Every notify() email to a suppressed address is skipped, and Resend drops
  // the rest: the person would stop hearing from us, starting with the notice.
  if (await isSuppressed(newEmail, tx)) return { status: "suppressed" };

  const [change] = await tx
    .insert(userEmailChanges)
    .values({
      userId: user.id,
      clerkId: user.clerkId,
      oldEmail: user.email,
      newEmail,
      changedByUserId: input.actorId,
    })
    .returning({ id: userEmailChanges.id });

  return {
    status: "ok",
    changeId: change.id,
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

  // Each outbox froze the address when the mail was queued. Only rows nobody
  // has picked up move: a worker holding a lease has already read its row, and
  // sent rows are history. Keys stay as they are; they are only dedup tokens.

  // The drain tells the owner from an admin by comparing this address with the
  // profile's, so a stale one sends the wrong template or fails the job.
  await tx
    .update(reservationNotificationJobs)
    .set({ recipientEmail: newEmail, updatedAt: sql`now()` })
    .where(
      and(
        eq(reservationNotificationJobs.userId, userId),
        eq(reservationNotificationJobs.status, "pending"),
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
        eq(disciplinaryNotificationJobs.status, "pending"),
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
        eq(notificationDeliveries.status, "pending"),
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

  // The day-of reminder goes to the ticket's own copy of the address. A guest
  // ticket for the same occurrence may already hold the new one; that ticket
  // keeps the old address rather than break the one-seat-per-address index.
  await tx.execute(sql`
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
  `);

  await stamp({ lastError: null, completed: true });
  return { status: "ok" };
}

/**
 * Clerk has the new address. Recorded on its own, before the database follows,
 * so a row with this set and no `completedAt` says where a change stopped.
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
