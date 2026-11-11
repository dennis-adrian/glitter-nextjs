import "server-only";

import { sql } from "drizzle-orm";

import { emailKey, isSuppressed } from "@/app/lib/emails/suppressions";
import {
  isResendableDelivery,
  type NotificationLogResend,
  type NotificationResendRefusalCode,
  notificationResendKey,
} from "@/app/lib/notifications/admin-resend-definitions";
import type {
  NotificationLogRow,
  NotificationLogStatus,
} from "@/app/lib/notifications/admin-log-definitions";
import { parseLogTimestamp } from "@/app/lib/notifications/admin-log-queries";
import { buildEmailCopy } from "@/app/lib/notifications/registry";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";

/**
 * "Reenviar correo" on the admin notification log, and what the log shows
 * about resends. Nothing here checks access: the action and the page do.
 *
 * A resend is a new `notification_deliveries` row: the failed row's address,
 * template and stored payload, so the email is the same one, linked back by
 * `resend_of_delivery_id` and stamped with `requested_by_user_id`. The failed
 * row is never touched. Its key, `notificationResendKey(id)`, is unique, so
 * a failed row has one resend at most: a double click, or two admins at
 * once, write one row and send one email. When the resend fails too, it is
 * a failed row of its own and can be resent from its own row.
 *
 * The send path's own checks are repeated here so the admin hears why at
 * once instead of reading "Omitido" later: a suppressed address and a
 * snapshot that no longer renders (`attemptNotificationDelivery`), a revoked
 * gift (`giftWasRevoked`). Unsubscribes are not checked: they cover bulk
 * mail only, and the transactional lane never reads them
 * (docs/email-unsubscribe-and-bounces.md).
 */

export type ResendFailedEmailOutcome =
  | { ok: true; deliveryId: number }
  | { ok: false; code: NotificationResendRefusalCode };

type Executor = Pick<typeof db, "execute" | "select">;

type OriginalRow = {
  id: number;
  channel: string;
  lane: string;
  status: string;
  template_key: string;
  recipient_email: string | null;
  payload: unknown;
  notification_id: number | null;
  user_id: number | null;
  account_email: string | null;
  account_exists: boolean;
  deleting: boolean;
  retracted: boolean;
  gift_revoked: boolean;
};

/**
 * The checks, in the order the admin would want to hear them. Exported for
 * the tests; `resendFailedNotificationEmail` is the one entry point.
 */
export async function resendRefusal(
  executor: Executor,
  row: OriginalRow | undefined,
  latestResendStatus: string | null,
): Promise<NotificationResendRefusalCode | null> {
  if (!row) return "NOT_FOUND";
  if (
    !isResendableDelivery({
      source: "delivery",
      channel: row.channel,
      lane: row.lane,
      status: row.status,
    }) ||
    !row.recipient_email?.trim()
  ) {
    return "NOT_ELIGIBLE";
  }
  if (latestResendStatus === "pending" || latestResendStatus === "processing") {
    return "RESEND_PENDING";
  }
  if (latestResendStatus === "sent") return "RESEND_SENT";
  if (latestResendStatus !== null) return "RESEND_DONE";
  if (row.user_id === null || !row.account_exists) return "NO_ACCOUNT";
  if (row.deleting) return "DELETING";
  // The confirmation names the address; it must still be the person's.
  if (
    !row.account_email?.trim() ||
    emailKey(row.account_email) !== emailKey(row.recipient_email)
  ) {
    return "EMAIL_CHANGED";
  }
  if (row.retracted) return "RETRACTED";
  if (row.gift_revoked) return "REVOKED";
  if (await isSuppressed(row.recipient_email, executor)) return "SUPPRESSED";
  if (!buildEmailCopy(row.template_key, row.payload)) {
    return "RENDER_UNAVAILABLE";
  }
  return null;
}

/**
 * Sends a failed transactional email again, as a new row. The failed row is
 * held FOR UPDATE while it is checked and the resend written, so a second
 * call waits and then finds the first one's row. Schedule the returned id
 * once this returns; the cron picks it up otherwise.
 */
export async function resendFailedNotificationEmail(input: {
  deliveryId: number;
  by: number;
}): Promise<ResendFailedEmailOutcome> {
  const outcome = await db.transaction(
    async (tx): Promise<ResendFailedEmailOutcome> => {
      const { rows } = await tx.execute<OriginalRow>(sql`
        SELECT d.id, d.channel::text AS channel, d.lane::text AS lane,
          d.status::text AS status, d.template_key, d.recipient_email,
          d.payload, d.notification_id, d.user_id,
          u.email AS account_email, (u.id IS NOT NULL) AS account_exists,
          EXISTS (
            SELECT 1 FROM pending_user_deletions p
            WHERE p.user_id = d.user_id AND p.local_deleted_at IS NULL
          ) AS deleting,
          (n.retracted_at IS NOT NULL) AS retracted,
          (d.template_key = 'credit_gift_received' AND EXISTS (
            SELECT 1 FROM notification_campaign_recipients r
            WHERE r.notification_id = d.notification_id
              AND r.revoked_at IS NOT NULL
          )) AS gift_revoked
        FROM notification_deliveries d
        LEFT JOIN users u ON u.id = d.user_id
        LEFT JOIN notifications n ON n.id = d.notification_id
        WHERE d.id = ${input.deliveryId}::integer
        FOR UPDATE OF d
      `);
      const row = rows[0];

      // Under the lock: a resend committed meanwhile is seen here.
      const { rows: resends } = row
        ? await tx.execute<{ status: string }>(sql`
            SELECT status::text AS status FROM notification_deliveries
            WHERE resend_of_delivery_id = ${row.id}::integer
              AND id > ${row.id}::integer
            ORDER BY id DESC
            LIMIT 1
          `)
        : { rows: [] };

      const refused = await resendRefusal(
        tx,
        row,
        resends[0]?.status ?? null,
      );
      if (refused) return { ok: false, code: refused };

      // The address and payload are copied in SQL: the email is the one
      // that failed, and no address goes through the query log.
      const { rows: inserted } = await tx.execute<{ id: number }>(sql`
        INSERT INTO notification_deliveries
          (notification_id, user_id, template_key, channel, lane,
           recipient_email, payload, idempotency_key, resend_of_delivery_id,
           requested_by_user_id)
        SELECT d.notification_id, d.user_id, d.template_key, d.channel,
          d.lane, d.recipient_email, d.payload,
          ${notificationResendKey(row!.id)}::text, d.id, ${input.by}::integer
        FROM notification_deliveries d
        WHERE d.id = ${row!.id}::integer
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `);
      const written = inserted[0];
      // Only if a resend was written outside this lock, which nothing does.
      if (!written) return { ok: false, code: "RESEND_PENDING" };
      return { ok: true, deliveryId: Number(written.id) };
    },
  );

  if (outcome.ok) {
    console.log("[notifications] admin resend", {
      of: input.deliveryId,
      deliveryId: outcome.deliveryId,
      by: input.by,
    });
  }
  return outcome;
}

type ResendLinkRow = {
  id: number;
  resend_of_delivery_id: number | null;
  status: string;
  created_at: unknown;
  requested_by_user_id: number | null;
};

const STATUSES: readonly NotificationLogStatus[] = [
  "pending",
  "processing",
  "sent",
  "failed",
  "skipped",
];

function asStatus(value: string): NotificationLogStatus {
  return (STATUSES as readonly string[]).includes(value)
    ? (value as NotificationLogStatus)
    : "pending";
}

/**
 * Adds `resend` to the page's delivery rows: who asked for a resend row, and
 * whether (and by whom) a row was sent again. Two reads by primary key
 * ranges: a resend always has a higher id than the row it resends, so its
 * lookup starts at the page's lowest id instead of scanning the table.
 */
export async function withNotificationLogResends(
  rows: NotificationLogRow[],
  executor: Executor = db,
): Promise<NotificationLogRow[]> {
  const ids = rows
    .filter((row) => row.source === "delivery")
    .map((row) => row.id);
  if (ids.length === 0) return rows;
  const idArray = sql`${sql.param(ids)}::int[]`;

  const [own, children] = await Promise.all([
    executor.execute<ResendLinkRow>(sql`
      SELECT id, resend_of_delivery_id, status::text AS status, created_at,
        requested_by_user_id
      FROM notification_deliveries
      WHERE id = ANY(${idArray}) AND resend_of_delivery_id IS NOT NULL
    `),
    executor.execute<ResendLinkRow>(sql`
      SELECT DISTINCT ON (resend_of_delivery_id) id, resend_of_delivery_id,
        status::text AS status, created_at, requested_by_user_id
      FROM notification_deliveries
      WHERE id > ${Math.min(...ids)}::integer
        AND resend_of_delivery_id = ANY(${idArray})
      ORDER BY resend_of_delivery_id, id DESC
    `),
  ]);

  const requesterIds = [
    ...new Set(
      [...own.rows, ...children.rows]
        .map((row) => row.requested_by_user_id)
        .filter((id): id is number => id !== null)
        .map(Number),
    ),
  ];
  const names = new Map<number, string | null>();
  if (requesterIds.length > 0) {
    const { rows: people } = await executor.execute<{
      id: number;
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>(sql`
      SELECT id, display_name, first_name, last_name FROM users
      WHERE id = ANY(${sql.param(requesterIds)}::int[])
    `);
    for (const person of people) {
      names.set(
        Number(person.id),
        getUserName({
          displayName: person.display_name,
          firstName: person.first_name,
          lastName: person.last_name,
        }) || null,
      );
    }
  }
  const who = (userId: number | null) =>
    userId === null
      ? null
      : { userId: Number(userId), name: names.get(Number(userId)) ?? null };

  const requestedBy = new Map<number, NotificationLogResend["requestedBy"]>();
  for (const row of own.rows) {
    requestedBy.set(Number(row.id), who(row.requested_by_user_id));
  }
  const resentAs = new Map<number, NotificationLogResend["resentAs"]>();
  for (const row of children.rows) {
    if (row.resend_of_delivery_id === null) continue;
    resentAs.set(Number(row.resend_of_delivery_id), {
      deliveryId: Number(row.id),
      status: asStatus(row.status),
      at: parseLogTimestamp(row.created_at) ?? new Date(0),
      by: who(row.requested_by_user_id),
    });
  }

  return rows.map((row) => {
    if (row.source !== "delivery") return row;
    const child = resentAs.get(row.id) ?? null;
    return {
      ...row,
      resend: {
        eligible: isResendableDelivery(row) && child === null,
        requestedBy: requestedBy.get(row.id) ?? null,
        resentAs: child,
      },
    };
  });
}
