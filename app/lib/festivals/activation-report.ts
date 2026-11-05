import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type { UserCategory } from "@/app/api/users/definitions";
import { db } from "@/db";

/**
 * What became of a festival's activation notice in Glitter
 * (`festival_participant_invitation`): who got it, who read it, which of
 * their devices took the push, and who enrolled once they had it.
 *
 * Read from what is already recorded: the inbox items, their push
 * deliveries and the festival's participation requests. A push counts as
 * sent once its push service accepted it, not once a phone showed it, which
 * the server never learns. A read is the item opened, from the list or from
 * its push; marking it unread again takes it back out.
 *
 * Staff only: callers check before calling.
 */

const KIND = "festival_participant_invitation";

function dedupeKey(festivalId: number) {
  return `festival-participant-invitation:${festivalId}`;
}

export const ACTIVATION_RECIPIENT_FILTERS = [
  "all",
  "unread",
  "read",
  "enrolled",
  "not_enrolled",
] as const;
export type ActivationRecipientFilter =
  (typeof ACTIVATION_RECIPIENT_FILTERS)[number];

export const ACTIVATION_RECIPIENTS_PAGE_SIZE = 50;

export type ActivationReportKpis = {
  /** People who got the inbox item. */
  notified: number;
  /** Of them, with the item read now. */
  read: number;
  /** Of them, with at least one push accepted by a push service. */
  pushReached: number;
  /** Push deliveries, one per device, by outcome. */
  pushSent: number;
  pushFailed: number;
  pushPending: number;
  /** Asked to take part after their item was written. */
  enrolledAfter: number;
  /** Had already asked before it, e.g. from an earlier activation. */
  enrolledBefore: number;
};

export type ActivationReport = {
  /** When the first item was written. */
  sentAt: Date;
  kpis: ActivationReportKpis;
};

export type ActivationRecipient = {
  userId: number;
  name: string;
  email: string;
  category: UserCategory;
  notifiedAt: Date;
  readAt: Date | null;
  push: { sent: number; failed: number; pending: number };
  /** Their participation request, if any. */
  enrollment: {
    at: Date;
    status: "pending" | "accepted" | "rejected";
    /** Made after the item was written. */
    afterNotice: boolean;
  } | null;
};

/**
 * One row per recipient: their item, their pushes summed per outcome, and
 * their participation request. Both joins are per recipient, so nothing is
 * counted twice.
 */
function recipientsSql(festivalId: number) {
  return sql`
    WITH n AS (
      SELECT id, user_id, created_at, read_at
      FROM notifications
      WHERE kind = ${KIND} AND dedupe_key = ${dedupeKey(festivalId)}
    ),
    p AS (
      SELECT d.notification_id,
        count(*) FILTER (WHERE d.status = 'sent')::int AS sent,
        count(*) FILTER (WHERE d.status IN ('failed', 'skipped'))::int AS failed,
        count(*) FILTER (WHERE d.status IN ('pending', 'processing'))::int AS pending
      FROM notification_deliveries d
      JOIN n ON n.id = d.notification_id
      WHERE d.channel = 'push'
      GROUP BY d.notification_id
    ),
    e AS (
      SELECT DISTINCT ON (r.user_id) r.user_id, r.created_at, r.status
      FROM user_requests r
      WHERE r.festival_id = ${festivalId}
        AND r.type = 'festival_participation'
      ORDER BY r.user_id, r.created_at
    ),
    rows AS (
      -- As timestamptz in UTC, so the driver reads them in the right zone.
      SELECT n.user_id, n.created_at AT TIME ZONE 'UTC' AS notified_at,
        n.read_at AT TIME ZONE 'UTC' AS read_at,
        coalesce(p.sent, 0) AS push_sent,
        coalesce(p.failed, 0) AS push_failed,
        coalesce(p.pending, 0) AS push_pending,
        e.created_at AT TIME ZONE 'UTC' AS enrolled_at,
        e.status AS enrollment_status,
        (e.created_at >= n.created_at) AS enrolled_after
      FROM n
      LEFT JOIN p ON p.notification_id = n.id
      LEFT JOIN e ON e.user_id = n.user_id
    )`;
}

/** The report's numbers, or null when the notice was never sent. */
export async function fetchActivationReport(
  festivalId: number,
): Promise<ActivationReport | null> {
  const result = await db.execute<{
    sent_at: string | Date | null;
    notified: number;
    read: number;
    push_reached: number;
    push_sent: number;
    push_failed: number;
    push_pending: number;
    enrolled_after: number;
    enrolled_before: number;
  }>(sql`
    ${recipientsSql(festivalId)}
    SELECT min(notified_at) AS sent_at,
      count(*)::int AS notified,
      count(*) FILTER (WHERE read_at IS NOT NULL)::int AS read,
      count(*) FILTER (WHERE push_sent > 0)::int AS push_reached,
      coalesce(sum(push_sent), 0)::int AS push_sent,
      coalesce(sum(push_failed), 0)::int AS push_failed,
      coalesce(sum(push_pending), 0)::int AS push_pending,
      count(*) FILTER (WHERE enrolled_after)::int AS enrolled_after,
      count(*) FILTER (WHERE enrolled_after = false)::int AS enrolled_before
    FROM rows
  `);
  const row = result.rows[0];
  if (!row || !row.sent_at || Number(row.notified) === 0) return null;
  return {
    sentAt: asDate(row.sent_at),
    kpis: {
      notified: Number(row.notified),
      read: Number(row.read),
      pushReached: Number(row.push_reached),
      pushSent: Number(row.push_sent),
      pushFailed: Number(row.push_failed),
      pushPending: Number(row.push_pending),
      enrolledAfter: Number(row.enrolled_after),
      enrolledBefore: Number(row.enrolled_before),
    },
  };
}

const FILTER_SQL: Record<ActivationRecipientFilter, SQL> = {
  all: sql`true`,
  unread: sql`r.read_at IS NULL`,
  read: sql`r.read_at IS NOT NULL`,
  enrolled: sql`r.enrolled_at IS NOT NULL`,
  not_enrolled: sql`r.enrolled_at IS NULL`,
};

/** One page of recipients, by name, and how many match the filter. */
export async function fetchActivationRecipients(
  festivalId: number,
  {
    filter = "all",
    page = 1,
  }: { filter?: ActivationRecipientFilter; page?: number } = {},
): Promise<{ recipients: ActivationRecipient[]; total: number }> {
  const offset = (Math.max(1, page) - 1) * ACTIVATION_RECIPIENTS_PAGE_SIZE;
  // Counted apart: a page past the end has no rows to count from.
  const counted = db.execute<{ total: number }>(sql`
    ${recipientsSql(festivalId)}
    SELECT count(*)::int AS total FROM rows r WHERE ${FILTER_SQL[filter]}
  `);
  const result = await db.execute<{
    user_id: number;
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string;
    category: UserCategory;
    notified_at: string | Date;
    read_at: string | Date | null;
    push_sent: number;
    push_failed: number;
    push_pending: number;
    enrolled_at: string | Date | null;
    enrollment_status: "pending" | "accepted" | "rejected" | null;
    enrolled_after: boolean | null;
  }>(sql`
    ${recipientsSql(festivalId)}
    SELECT r.*, u.display_name, u.first_name, u.last_name, u.email,
      u.category
    FROM rows r
    JOIN users u ON u.id = r.user_id
    WHERE ${FILTER_SQL[filter]}
    ORDER BY lower(coalesce(u.display_name, u.first_name, u.email)), u.id
    LIMIT ${ACTIVATION_RECIPIENTS_PAGE_SIZE} OFFSET ${offset}
  `);

  return {
    total: Number((await counted).rows[0]?.total ?? 0),
    recipients: result.rows.map((row) => ({
      userId: Number(row.user_id),
      name:
        row.display_name?.trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        row.email,
      email: row.email,
      category: row.category,
      notifiedAt: asDate(row.notified_at),
      readAt: row.read_at ? asDate(row.read_at) : null,
      push: {
        sent: Number(row.push_sent),
        failed: Number(row.push_failed),
        pending: Number(row.push_pending),
      },
      enrollment:
        row.enrolled_at && row.enrollment_status
          ? {
              at: asDate(row.enrolled_at),
              status: row.enrollment_status,
              afterNotice: row.enrolled_after === true,
            }
          : null,
    })),
  };
}

/** A UTC instant from the driver: a Date, or its text when parsing is off. */
function asDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}
