import "server-only";

import { and, eq, sql, type SQL } from "drizzle-orm";

import type { EmailTopic } from "@/app/lib/emails/topics";
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
 * spam (every mailing), and people who unsubscribed from one topic. Single
 * emails someone triggers themselves (their ticket, a reservation, a payment)
 * are not affected.
 */

export type SuppressionReason = "bounce" | "complaint";

/** The form every row here is keyed by: `lower(trim(address))`. */
export function emailKey(address: string) {
  return address.trim().toLowerCase();
}

const DETAIL_MAX_LENGTH = 500;

/**
 * Stops all bulk mail to `address`. A complaint outranks a bounce: webhooks
 * can arrive late and out of order, and a later bounce must not erase that
 * the person reported us.
 */
export async function recordSuppression(input: {
  address: string;
  reason: SuppressionReason;
  resendEmailId?: string | null;
  detail?: string | null;
}) {
  const key = emailKey(input.address);
  if (!key) return;
  const now = new Date();
  await db
    .insert(emailSuppressions)
    .values({
      emailKey: key,
      reason: input.reason,
      resendEmailId: input.resendEmailId ?? null,
      detail: input.detail?.slice(0, DETAIL_MAX_LENGTH) ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: emailSuppressions.emailKey,
      set: {
        reason: sql`excluded.reason`,
        resendEmailId: sql`excluded.resend_email_id`,
        detail: sql`excluded.detail`,
        updatedAt: now,
      },
      setWhere: sql`not (${emailSuppressions.reason} = 'complaint' and excluded.reason = 'bounce')`,
    });
}

/** Resend lifted its own suppression of `address`: follow it. */
export async function removeSuppression(address: string) {
  const key = emailKey(address);
  if (!key) return;
  await db.delete(emailSuppressions).where(eq(emailSuppressions.emailKey, key));
}

export async function unsubscribe(address: string, topic: EmailTopic) {
  const key = emailKey(address);
  if (!key) return;
  await db
    .insert(emailUnsubscribes)
    .values({ emailKey: key, topic })
    .onConflictDoNothing();
}

export async function resubscribe(address: string, topic: EmailTopic) {
  const key = emailKey(address);
  if (!key) return;
  await db
    .delete(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, key),
        eq(emailUnsubscribes.topic, topic),
      ),
    );
}

export async function isUnsubscribed(address: string, topic: EmailTopic) {
  const [row] = await db
    .select({ id: emailUnsubscribes.id })
    .from(emailUnsubscribes)
    .where(
      and(
        eq(emailUnsubscribes.emailKey, emailKey(address)),
        eq(emailUnsubscribes.topic, topic),
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
export function reachableByBulkMail(address: SQL, topic: EmailTopic) {
  return sql`(
    not exists (
      select 1 from ${emailSuppressions}
      where ${emailSuppressions.emailKey} = lower(trim(${address}))
    )
    and not exists (
      select 1 from ${emailUnsubscribes}
      where ${emailUnsubscribes.emailKey} = lower(trim(${address}))
        and ${emailUnsubscribes.topic} = ${topic}
    )
  )`;
}

/**
 * Why a mailing on `topic` skips `address`: `bounced` (it cannot receive
 * mail), `opted_out` (they unsubscribed or reported us), or null when it
 * does not. For the counts shown before sending.
 */
export function bulkMailExclusion(address: SQL, topic: EmailTopic) {
  return sql<"bounced" | "opted_out" | null>`(
    case
      when exists (
        select 1 from ${emailSuppressions}
        where ${emailSuppressions.emailKey} = lower(trim(${address}))
          and ${emailSuppressions.reason} = 'bounce'
      ) then 'bounced'
      when exists (
        select 1 from ${emailSuppressions}
        where ${emailSuppressions.emailKey} = lower(trim(${address}))
          and ${emailSuppressions.reason} = 'complaint'
      ) or exists (
        select 1 from ${emailUnsubscribes}
        where ${emailUnsubscribes.emailKey} = lower(trim(${address}))
          and ${emailUnsubscribes.topic} = ${topic}
      ) then 'opted_out'
      else null
    end
  )`;
}
