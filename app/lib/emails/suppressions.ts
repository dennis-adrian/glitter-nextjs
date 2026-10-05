import "server-only";

import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";

import type { EmailTopic, MailingTopic } from "@/app/lib/emails/topics";
import type { UnsubscribeRecipient } from "@/app/lib/emails/unsubscribe-tokens";
import { db } from "@/db";
import {
  emailSuppressions,
  emailUnsubscribes,
  users,
  visitors,
} from "@/db/schema";

/**
 * Who bulk mailings skip: addresses that bounced for good or reported us as
 * spam (every mailing), and people who unsubscribed from one topic or, the
 * `all` topic, from every one. Single emails someone triggers themselves
 * (their ticket, a reservation, a payment) are not affected.
 */

export type SuppressionReason = "bounce" | "complaint";

/** The form every row here is keyed by: `lower(trim(address))`. */
export function emailKey(address: string) {
  return address.trim().toLowerCase();
}

const DETAIL_MAX_LENGTH = 500;

/**
 * Stops all bulk mail to `address`, as of `eventAt`: when Resend created the
 * event that reported it. Webhooks repeat and arrive out of order, so:
 *
 * - after a lift, only a suppression that happened later applies again;
 * - a complaint outranks a bounce, whenever either arrives: a bounce never
 *   erases that the person reported us.
 */
export async function recordSuppression(input: {
  address: string;
  reason: SuppressionReason;
  resendEmailId?: string | null;
  detail?: string | null;
  eventAt?: Date | null;
}) {
  const key = emailKey(input.address);
  if (!key) return;
  const now = new Date();
  const eventAt = input.eventAt ?? now;
  const existing = emailSuppressions;
  // A bounce after an active complaint changes nothing but the clock.
  const keepComplaint = sql`(
    ${existing.liftedAt} is null
    and ${existing.reason} = 'complaint'
    and excluded.reason = 'bounce'
  )`;
  await db
    .insert(emailSuppressions)
    .values({
      emailKey: key,
      reason: input.reason,
      resendEmailId: input.resendEmailId ?? null,
      detail: input.detail?.slice(0, DETAIL_MAX_LENGTH) ?? null,
      lastEventAt: eventAt,
      liftedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: emailSuppressions.emailKey,
      set: {
        reason: sql`case when ${keepComplaint} then ${existing.reason} else excluded.reason end`,
        resendEmailId: sql`case when ${keepComplaint} then ${existing.resendEmailId} else excluded.resend_email_id end`,
        detail: sql`case when ${keepComplaint} then ${existing.detail} else excluded.detail end`,
        lastEventAt: sql`greatest(excluded.last_event_at, ${existing.lastEventAt})`,
        liftedAt: null,
        liftedByUserId: null,
        updatedAt: now,
      },
      setWhere: sql`(
        (${existing.liftedAt} is not null and excluded.last_event_at > ${existing.liftedAt})
        or (
          ${existing.liftedAt} is null
          and (
            excluded.reason = 'complaint'
            or excluded.last_event_at >= coalesce(${existing.lastEventAt}, '-infinity'::timestamp)
          )
        )
      )`,
    });
}

/**
 * Lifts the suppression of `address` as of `eventAt`: bulk mail may reach it
 * again. Done by Resend (its webhook) or by an admin (`liftedByUserId`).
 *
 * Kept as a lifted row rather than deleted, so a late copy of an older
 * bounce or complaint is recognised and ignored; and a lift older than the
 * newest suppression changes nothing. Resend confirming an admin's lift
 * keeps the admin as the one who lifted it.
 */
export async function liftSuppression(input: {
  address: string;
  /** What it had been suppressed for; only kept for the record. */
  reason: SuppressionReason;
  eventAt?: Date | null;
  liftedByUserId?: number | null;
}) {
  const key = emailKey(input.address);
  if (!key) return;
  const now = new Date();
  const eventAt = input.eventAt ?? now;
  const existing = emailSuppressions;
  await db
    .insert(emailSuppressions)
    .values({
      emailKey: key,
      reason: input.reason,
      lastEventAt: eventAt,
      liftedAt: eventAt,
      liftedByUserId: input.liftedByUserId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: emailSuppressions.emailKey,
      set: {
        lastEventAt: sql`excluded.last_event_at`,
        liftedAt: sql`excluded.lifted_at`,
        liftedByUserId: sql`case
          when excluded.lifted_by_user_id is not null then excluded.lifted_by_user_id
          when ${existing.liftedAt} is not null then ${existing.liftedByUserId}
          else null
        end`,
        updatedAt: now,
      },
      setWhere: sql`excluded.last_event_at >= coalesce(${existing.lastEventAt}, '-infinity'::timestamp)`,
    });
}

/** The address bounced or reported us, and Resend has not lifted it. */
export async function isSuppressed(address: string) {
  const [row] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.emailKey, emailKey(address)),
        isNull(emailSuppressions.liftedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Stops `topic` (or, for `all`, every kind of bulk mail) to `address`. An
 * admin doing it for someone passes their own id; already being unsubscribed
 * changes nothing, including who did it.
 */
export async function unsubscribe(
  address: string,
  topic: EmailTopic,
  createdByUserId: number | null = null,
) {
  const key = emailKey(address);
  if (!key) return;
  await db
    .insert(emailUnsubscribes)
    .values({ emailKey: key, topic, createdByUserId })
    .onConflictDoNothing();
}

/**
 * The person asked, from a link in one of our emails, to get `topic` again.
 * An earlier "stop everything" goes too: their latest choice is to receive
 * mail from us.
 */
export async function resubscribe(address: string, topic: MailingTopic) {
  const key = emailKey(address);
  if (!key) return;
  await db
    .delete(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, key),
        inArray(emailUnsubscribes.topic, [topic, "all"]),
      ),
    );
}

/** Removes exactly one unsubscribe row, as an admin choosing it. */
export async function deleteUnsubscribe(address: string, topic: EmailTopic) {
  const key = emailKey(address);
  if (!key) return 0;
  const removed = await db
    .delete(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, key),
        eq(emailUnsubscribes.topic, topic),
      ),
    )
    .returning({ id: emailUnsubscribes.id });
  return removed.length;
}

/** Whether `topic` mail skips `address` because they unsubscribed from it. */
export async function isUnsubscribed(address: string, topic: MailingTopic) {
  const [row] = await db
    .select({ id: emailUnsubscribes.id })
    .from(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, emailKey(address)),
        inArray(emailUnsubscribes.topic, [topic, "all"]),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** The address an unsubscribe link's recipient has now, or null. */
export async function recipientAddress(recipient: UnsubscribeRecipient) {
  if (recipient.kind === "visitor") {
    const [row] = await db
      .select({ email: visitors.email })
      .from(visitors)
      .where(eq(visitors.id, recipient.id))
      .limit(1);
    return row?.email ?? null;
  }
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, recipient.id))
    .limit(1);
  return row?.email ?? null;
}

/**
 * True for an `address` (a column or expression) a mailing on `topic` may
 * reach. Correlated on the normalized address, so every case variant of a
 * suppressed address is skipped too.
 */
export function reachableByBulkMail(address: SQL, topic: MailingTopic) {
  return sql`(
    not exists (
      select 1 from ${emailSuppressions}
      where ${emailSuppressions.emailKey} = lower(trim(${address}))
        and ${emailSuppressions.liftedAt} is null
    )
    and not exists (
      select 1 from ${emailUnsubscribes}
      where ${emailUnsubscribes.emailKey} = lower(trim(${address}))
        and ${emailUnsubscribes.topic} in (${topic}, 'all')
    )
  )`;
}

/**
 * Why a mailing on `topic` skips `address`: `bounced` (it cannot receive
 * mail), `opted_out` (they unsubscribed or reported us), or null when it
 * does not. For the counts shown before sending.
 */
export function bulkMailExclusion(address: SQL, topic: MailingTopic) {
  return sql<"bounced" | "opted_out" | null>`(
    case
      when exists (
        select 1 from ${emailSuppressions}
        where ${emailSuppressions.emailKey} = lower(trim(${address}))
          and ${emailSuppressions.liftedAt} is null
          and ${emailSuppressions.reason} = 'bounce'
      ) then 'bounced'
      when exists (
        select 1 from ${emailSuppressions}
        where ${emailSuppressions.emailKey} = lower(trim(${address}))
          and ${emailSuppressions.liftedAt} is null
          and ${emailSuppressions.reason} = 'complaint'
      ) or exists (
        select 1 from ${emailUnsubscribes}
        where ${emailUnsubscribes.emailKey} = lower(trim(${address}))
          and ${emailUnsubscribes.topic} in (${topic}, 'all')
      ) then 'opted_out'
      else null
    end
  )`;
}
