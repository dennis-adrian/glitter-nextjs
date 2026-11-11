import "server-only";

import { sql } from "drizzle-orm";

import {
  detectFailurePatterns,
  FAILURE_WINDOW_HOURS,
  type FailureChannel,
  type FailurePoint,
  type NotificationFailureSummary,
  PUSH_PLATFORMS,
  type PushPlatform,
  ROUTINE_FAILURE_ERRORS,
} from "@/app/lib/notifications/admin-log-failures-definitions";
import { parseLogTimestamp } from "@/app/lib/notifications/admin-log-queries";
import { requireAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";

/**
 * The failure summary of the admin notification log
 * (`admin-log-failures-definitions.ts` says what counts).
 *
 * Every read is bounded to the window and goes through the existing
 * `(status, next_attempt_at)` index of each table: a row's
 * `next_attempt_at` is never earlier than its `created_at` (it starts at
 * insert time and only moves forward), so `next_attempt_at >= since` keeps
 * every row created since then, and the index range on `status = 'failed'`
 * reads only recent failures. The margin absorbs app/database clock skew.
 */

/** Distinct (recipient, error) pairs read for the patterns, at most. */
const MAX_POINTS = 5000;
const SCAN_MARGIN_MS = 60 * 60 * 1000;
/** Longest error text grouped and shown; provider errors can be long. */
const MAX_ERROR_LENGTH = 120;

/** The UTC wall-clock text the `timestamp` columns hold. */
function wallClock(date: Date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function bounds(now: Date) {
  const since = new Date(now.getTime() - FAILURE_WINDOW_HOURS * 3_600_000);
  return {
    since,
    sinceText: wallClock(since),
    scanText: wallClock(new Date(since.getTime() - SCAN_MARGIN_MS)),
    untilText: wallClock(now),
  };
}

function windowed(
  alias: string,
  { sinceText, scanText, untilText }: ReturnType<typeof bounds>,
) {
  const a = sql.raw(alias);
  return sql`${a}.status = 'failed'
    AND ${a}.next_attempt_at >= ${scanText}::timestamp
    AND ${a}.created_at >= ${sinceText}::timestamp
    AND ${a}.created_at <= ${untilText}::timestamp`;
}

const ROUTINE = sql.join(
  ROUTINE_FAILURE_ERRORS.map((error) => sql`${error}`),
  sql`, `,
);

/** A push service from the endpoint's host, which never leaves the query. */
const PLATFORM = sql`CASE
  WHEN ps.endpoint IS NULL THEN 'unknown'
  WHEN ps.endpoint LIKE 'https://fcm.googleapis.com/%'
    OR ps.endpoint LIKE 'https://jmt17.google.com/%' THEN 'fcm'
  WHEN ps.endpoint ~ '^https://[a-z0-9.-]*\\.push\\.apple\\.com/' THEN 'apple'
  WHEN ps.endpoint LIKE 'https://updates.push.services.mozilla.com/%' THEN 'mozilla'
  WHEN ps.endpoint ~ '^https://[a-z0-9.-]*\\.notify\\.windows\\.com/' THEN 'wns'
  ELSE 'other'
END`;

function errorText(column: string) {
  return sql.raw(
    `left(coalesce(nullif(btrim(${column}), ''), 'sin_detalle'), ${MAX_ERROR_LENGTH})`,
  );
}

async function readCounts(range: ReturnType<typeof bounds>) {
  const { rows } = await db.execute<{ email: number; push: number }>(sql`
    SELECT
      (SELECT count(*) FROM notification_deliveries d
        WHERE d.channel = 'email' AND ${windowed("d", range)})
      + (SELECT count(*) FROM reservation_notification_jobs r
        WHERE ${windowed("r", range)})
      + (SELECT count(*) FROM disciplinary_notification_jobs j
        WHERE ${windowed("j", range)}
          AND coalesce(j.last_error, '') <> ALL (ARRAY[${ROUTINE}]::text[]))
      AS email,
      (SELECT count(*) FROM notification_deliveries d
        WHERE d.channel = 'push' AND ${windowed("d", range)}) AS push
  `);
  const row = rows[0];
  return {
    email: Number(row?.email ?? 0),
    push: Number(row?.push ?? 0),
  };
}

type RawPoint = {
  channel: FailureChannel;
  error: string;
  platform: string | null;
  recipient: string;
  first_at: unknown;
  failures: number;
};

async function readPoints(
  range: ReturnType<typeof bounds>,
): Promise<FailurePoint[]> {
  const { rows } = await db.execute<RawPoint>(sql`
    SELECT channel, error, platform, recipient,
      min(created_at) AS first_at, count(*)::integer AS failures
    FROM (
      SELECT d.channel::text AS channel, ${errorText("d.last_error")} AS error,
        CASE WHEN d.channel = 'push' THEN ${PLATFORM} END AS platform,
        CASE WHEN d.channel = 'email'
          THEN 'email:' || lower(btrim(d.recipient_email))
          ELSE 'device:' || coalesce(d.push_subscription_id::text, 'row-' || d.id)
        END AS recipient,
        d.created_at
      FROM notification_deliveries d
      LEFT JOIN push_subscriptions ps ON ps.id = d.push_subscription_id
      WHERE ${windowed("d", range)}
      UNION ALL
      SELECT 'email', ${errorText("r.last_error")}, NULL,
        'email:' || lower(btrim(r.recipient_email)), r.created_at
      FROM reservation_notification_jobs r
      WHERE ${windowed("r", range)}
      UNION ALL
      SELECT 'email', ${errorText("j.last_error")}, NULL,
        'email:' || lower(btrim(j.recipient_email)), j.created_at
      FROM disciplinary_notification_jobs j
      WHERE ${windowed("j", range)}
        AND coalesce(j.last_error, '') <> ALL (ARRAY[${ROUTINE}]::text[])
    ) failed
    GROUP BY channel, error, platform, recipient
    ORDER BY first_at DESC
    LIMIT ${MAX_POINTS}
  `);
  return rows.map((row) => ({
    channel: row.channel,
    error: row.error,
    platform:
      row.platform === null
        ? null
        : (PUSH_PLATFORMS as readonly string[]).includes(row.platform)
          ? (row.platform as PushPlatform)
          : "other",
    recipient: row.recipient,
    firstAt: parseLogTimestamp(row.first_at) ?? new Date(0),
    failures: Number(row.failures),
  }));
}

/**
 * Failures of the last 24 hours, by channel, and the patterns among them.
 * Null for anyone but an admin. `now` is for the tests.
 */
export async function fetchNotificationFailureSummary(
  now: Date = new Date(),
): Promise<NotificationFailureSummary | null> {
  if (!(await requireAdmin())) return null;
  const range = bounds(now);
  const [counts, points] = await Promise.all([
    readCounts(range),
    readPoints(range),
  ]);
  return {
    since: range.since,
    until: now,
    counts,
    patterns: detectFailurePatterns(points),
  };
}
