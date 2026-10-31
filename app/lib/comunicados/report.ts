import "server-only";

import { and, eq, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type {
  ComunicadoRetractCounts,
  ComunicadoRetryCounts,
} from "@/app/lib/comunicados/contracts";
import {
  type ComunicadoAudienceSummary,
  parseComunicadoAudienceSummary,
} from "@/app/lib/comunicados/definitions";
import {
  COMUNICADO_REPORT_PAGE_SIZE,
  COMUNICADO_STALL_MS,
  type ComunicadoEmailDelivery,
  type ComunicadoRecipientFilter,
  type ComunicadoRecipientStatus,
  comunicadoAppLabel,
  comunicadoDeviceLabel,
  comunicadoEmailLabel,
  RESEND_CONFIG_ERRORS,
  RESEND_QUOTA_ERRORS,
} from "@/app/lib/comunicados/report-labels";
import {
  COMUNICADO_SKIP_REASONS,
  type ComunicadoRecipientSource,
} from "@/app/lib/comunicados/skip-reasons";
import type { Paged } from "@/app/lib/distribution_lists/definitions";
import { requireAdmin } from "@/app/lib/users/helpers";
import { userSearchCondition } from "@/app/lib/users/search-condition";
import { getUserName } from "@/app/lib/users/utils";
import { db } from "@/db";
import {
  comunicadoRevisions,
  comunicados,
  notificationCampaigns,
  users,
} from "@/db/schema";

export type { ComunicadoRecipientFilter } from "@/app/lib/comunicados/report-labels";

/**
 * A sent comunicado's report (docs/IMPLEMENTATION-comunicados.md F6, G6):
 * the KPIs, the banners' predicates and the paged recipients table, all from
 * the recipient rows and each one's latest email delivery. Global admins
 * only: every query checks inside, and answers anyone else with null.
 */

/** Longest search term the table takes, as the people search does. */
const SEARCH_MAX = 100;

async function canRead() {
  return (await requireAdmin()) !== null;
}

function personName(
  row: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null,
) {
  if (!row) return null;
  return getUserName(row) || null;
}

/**
 * A timestamp read through raw SQL comes back as the driver's string, in the
 * UTC wall time the columns hold, so it is read the way drizzle reads them.
 */
function parseTimestamp(value: Date | string | null): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const date = new Date(`${value}+0000`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Every recipient row with its inbox item and the item's latest email
 * delivery, the rows each count and the table read. The lateral join walks
 * `notification_deliveries_notification_idx`; a recipient still pending has
 * no item, so no delivery either.
 */
export const recipientsWithLatestEmailSql = sql`notification_campaign_recipients r
  LEFT JOIN notifications n ON n.id = r.notification_id
  LEFT JOIN LATERAL (
    SELECT d.status, d.last_error, d.maybe_sent_at, d.sent_at,
           d.content_revision, d.recipient_email, d.updated_at
    FROM notification_deliveries d
    WHERE d.notification_id = n.id AND d.channel = 'email'
    ORDER BY d.id DESC
    LIMIT 1
  ) d ON true`;

/** "Destinatarios": whose inbox it reached or is about to (D-21). */
export const receivingRecipientSql = sql`r.status IN ('notified', 'pending')`;

/** Read in the app: only an item that reached the person counts. */
export const readRecipientSql = sql`r.status = 'notified' AND n.read_at IS NOT NULL`;

export type ComunicadoReportKpis = {
  /** Notified or still pending. */
  recipients: number;
  /** Failed, or skipped for a reason other than the preview narrowing. */
  notReceived: number;
  /** List members a preview or development left out (the test banner). */
  stagingSkipped: number;
  read: number;
  notified: number;
  emailSent: number;
  /** Sent, queued or failed: what was meant to go. */
  emailPlanned: number;
  emailUnsubscribed: number;
  emailSuppressed: number;
  emailFailed: number;
  /** Any other skip: an invalid address, a pre-check, a retraction. */
  emailOtherSkipped: number;
  emailQueued: number;
  /** May have reached Resend and is not recorded sent. */
  maybeSent: number;
  /** Bounces and complaints whose latest event came from these emails. */
  bounces: number;
  /** Sent with a provider id: the denominator of the bounce share. */
  confirmedSent: number;
  pushSent: number;
  pushTotal: number;
  pendingRecipients: number;
};

export type ComunicadoReport = {
  id: number;
  title: string;
  campaignId: number;
  campaignStatus: "processing" | "completed";
  sentAt: Date;
  sentByName: string | null;
  currentRevision: number;
  /** The current revision's HTML, sanitized at send. */
  html: string;
  sendEmail: boolean;
  sendPush: boolean;
  essential: boolean;
  essentialReason: string | null;
  essentialConfirmedByName: string | null;
  essentialConfirmedAt: Date | null;
  retractedAt: Date | null;
  retractedByName: string | null;
  retractReason: string | null;
  /** Null when the stored summary no longer parses. */
  summary: ComunicadoAudienceSummary | null;
  kpis: ComunicadoReportKpis;
  banners: {
    /** The oldest pending email is held by a Resend config refusal. */
    configStalled: boolean;
    /** A latest email ended failed on the plan's quota. */
    quota: boolean;
    /** Email waits and nothing settled in 10 minutes: since when (D-22). */
    stalledSince: Date | null;
  };
  retractCounts: ComunicadoRetractCounts;
  /** What "Reintentar fallidos" would reach (G6, V7). */
  retryCounts: ComunicadoRetryCounts;
};

const sentBy = alias(users, "sent_by");
const confirmedBy = alias(users, "confirmed_by");
const retractedBy = alias(users, "retracted_by");

type RecipientCountsRow = {
  recipients: number;
  notified: number;
  pending: number;
  not_received: number;
  staging_skipped: number;
  read: number;
  email_sent: number;
  email_queued: number;
  email_failed: number;
  email_unsubscribed: number;
  email_suppressed: number;
  email_other_skipped: number;
  email_untried: number;
  email_maybe_sent: number;
  email_quota: number;
  recipients_failed: number;
  email_retryable: number;
  email_failed_maybe_sent: number;
  stalled_since: string | Date | null;
};

/** One aggregate over the recipients and each one's latest email (G6). */
async function recipientCounts(campaignId: number) {
  const staging = COMUNICADO_SKIP_REASONS.staging;
  const quota = sql.param([...RESEND_QUOTA_ERRORS]);
  const result = await db.execute<RecipientCountsRow>(sql`
    WITH counts AS (
      SELECT
        count(*) FILTER (WHERE ${receivingRecipientSql})::int AS recipients,
        count(*) FILTER (WHERE r.status = 'notified')::int AS notified,
        count(*) FILTER (WHERE r.status = 'pending')::int AS pending,
        count(*) FILTER (
          WHERE r.status = 'failed'
             OR (r.status = 'skipped' AND r.skipped_reason <> ${staging})
        )::int AS not_received,
        count(*) FILTER (
          WHERE r.status = 'skipped' AND r.skipped_reason = ${staging}
        )::int AS staging_skipped,
        count(*) FILTER (WHERE ${readRecipientSql})::int AS read,
        count(*) FILTER (WHERE d.status = 'sent')::int AS email_sent,
        count(*) FILTER (
          WHERE d.status IN ('pending', 'processing')
        )::int AS email_queued,
        count(*) FILTER (WHERE d.status = 'failed')::int AS email_failed,
        count(*) FILTER (
          WHERE d.status = 'skipped' AND d.last_error = 'unsubscribed'
        )::int AS email_unsubscribed,
        count(*) FILTER (
          WHERE d.status = 'skipped' AND d.last_error = 'suppressed'
        )::int AS email_suppressed,
        count(*) FILTER (
          WHERE d.status = 'skipped'
            AND d.last_error IS DISTINCT FROM 'unsubscribed'
            AND d.last_error IS DISTINCT FROM 'suppressed'
        )::int AS email_other_skipped,
        count(*) FILTER (
          WHERE d.status IN ('pending', 'processing') AND d.maybe_sent_at IS NULL
        )::int AS email_untried,
        count(*) FILTER (
          WHERE d.maybe_sent_at IS NOT NULL AND d.status <> 'sent'
        )::int AS email_maybe_sent,
        count(*) FILTER (
          WHERE d.status = 'failed' AND d.last_error = ANY(${quota}::text[])
        )::int AS email_quota,
        -- "Reintentar fallidos": the same rows the retry picks (G6, V7).
        count(*) FILTER (WHERE r.status = 'failed')::int AS recipients_failed,
        count(*) FILTER (
          WHERE r.status = 'notified' AND n.retracted_at IS NULL
            AND d.status = 'failed' AND d.maybe_sent_at IS NULL
        )::int AS email_retryable,
        count(*) FILTER (
          WHERE d.status = 'failed' AND d.maybe_sent_at IS NOT NULL
        )::int AS email_failed_maybe_sent,
        max(d.updated_at) FILTER (
          WHERE d.status IN ('sent', 'failed', 'skipped')
        ) AS last_settled_at
      FROM ${recipientsWithLatestEmailSql}
      WHERE r.campaign_id = ${campaignId}
    )
    SELECT counts.*,
      -- Nothing settled yet counts from the send itself; the database's
      -- clock, so the page and the rows agree.
      CASE WHEN s.since < now() - make_interval(secs => ${COMUNICADO_STALL_MS / 1000}::double precision)
           THEN s.since END AS stalled_since
    FROM counts
    CROSS JOIN LATERAL (
      SELECT coalesce(counts.last_settled_at, c.created_at) AS since
      FROM notification_campaigns c WHERE c.id = ${campaignId}
    ) s`);
  return result.rows[0];
}

type DeliveryCountsRow = {
  bounces: number;
  confirmed_sent: number;
  push_total: number;
  push_sent: number;
  oldest_pending_error: string | null;
};

/**
 * Over every delivery of the campaign, not only the latest: a bounce joins
 * by the Resend id it came from (runbook query 8), through the unique
 * `email_key` index.
 */
async function deliveryCounts(campaignId: number) {
  const result = await db.execute<DeliveryCountsRow>(sql`
    SELECT
      count(DISTINCT s.id)::int AS bounces,
      count(*) FILTER (
        WHERE d.channel = 'email' AND d.status = 'sent'
          AND d.provider_message_id IS NOT NULL
      )::int AS confirmed_sent,
      count(*) FILTER (WHERE d.channel = 'push')::int AS push_total,
      count(*) FILTER (
        WHERE d.channel = 'push' AND d.status = 'sent'
      )::int AS push_sent,
      (
        SELECT p.last_error
        FROM notification_deliveries p
        JOIN notifications pn ON pn.id = p.notification_id
        WHERE pn.campaign_id = ${campaignId}
          AND p.lane = 'bulk' AND p.channel = 'email' AND p.status = 'pending'
        ORDER BY p.id
        LIMIT 1
      ) AS oldest_pending_error
    FROM notifications n
    JOIN notification_deliveries d ON d.notification_id = n.id
    LEFT JOIN email_suppressions s
      ON d.channel = 'email'
     AND s.email_key = lower(btrim(d.recipient_email))
     AND s.resend_email_id = d.provider_message_id
    WHERE n.campaign_id = ${campaignId}`);
  return result.rows[0];
}

/**
 * The page of a sent comunicado: what it said, who it reached, and how its
 * email is going. Null for a draft, a scheduled one, or anyone but a global
 * admin.
 */
export async function fetchComunicadoReport(
  comunicadoId: number,
): Promise<ComunicadoReport | null> {
  if (!(await canRead())) return null;
  const [row] = await db
    .select({
      id: comunicados.id,
      title: comunicados.title,
      campaignId: comunicados.campaignId,
      campaignStatus: notificationCampaigns.status,
      campaignCreatedAt: notificationCampaigns.createdAt,
      sentAt: comunicados.sentAt,
      currentRevision: comunicados.currentRevision,
      sendEmail: comunicados.sendEmail,
      sendPush: comunicados.sendPush,
      essential: comunicados.essential,
      essentialReason: comunicados.essentialReason,
      essentialConfirmedAt: comunicados.essentialConfirmedAt,
      retractedAt: comunicados.retractedAt,
      retractReason: comunicados.retractReason,
      audienceSummary: comunicados.audienceSummary,
      revisionTitle: comunicadoRevisions.title,
      html: comunicadoRevisions.html,
      // Each person's id first: drizzle reads a left-joined object as
      // missing when its first column is null, so someone without a display
      // name would lose their first and last names with it.
      sentBy: {
        id: sentBy.id,
        displayName: sentBy.displayName,
        firstName: sentBy.firstName,
        lastName: sentBy.lastName,
      },
      confirmedBy: {
        id: confirmedBy.id,
        displayName: confirmedBy.displayName,
        firstName: confirmedBy.firstName,
        lastName: confirmedBy.lastName,
      },
      retractedBy: {
        id: retractedBy.id,
        displayName: retractedBy.displayName,
        firstName: retractedBy.firstName,
        lastName: retractedBy.lastName,
      },
    })
    .from(comunicados)
    .innerJoin(
      notificationCampaigns,
      eq(notificationCampaigns.id, comunicados.campaignId),
    )
    .leftJoin(
      comunicadoRevisions,
      and(
        eq(comunicadoRevisions.comunicadoId, comunicados.id),
        eq(comunicadoRevisions.revision, comunicados.currentRevision),
      ),
    )
    .leftJoin(sentBy, eq(sentBy.id, comunicados.sentByUserId))
    .leftJoin(
      confirmedBy,
      eq(confirmedBy.id, comunicados.essentialConfirmedByUserId),
    )
    .leftJoin(retractedBy, eq(retractedBy.id, comunicados.retractedByUserId))
    .where(
      and(eq(comunicados.id, comunicadoId), eq(comunicados.status, "sent")),
    )
    .limit(1);
  // The CHECKs give every sent row a campaign and a revision, so a sent
  // comunicado always has a report.
  if (!row || row.campaignId === null || row.currentRevision === null) {
    return null;
  }

  const [counts, deliveries] = await Promise.all([
    recipientCounts(row.campaignId),
    deliveryCounts(row.campaignId),
  ]);
  const kpis: ComunicadoReportKpis = {
    recipients: counts?.recipients ?? 0,
    notReceived: counts?.not_received ?? 0,
    stagingSkipped: counts?.staging_skipped ?? 0,
    read: counts?.read ?? 0,
    notified: counts?.notified ?? 0,
    emailSent: counts?.email_sent ?? 0,
    emailPlanned:
      (counts?.email_sent ?? 0) +
      (counts?.email_queued ?? 0) +
      (counts?.email_failed ?? 0),
    emailUnsubscribed: counts?.email_unsubscribed ?? 0,
    emailSuppressed: counts?.email_suppressed ?? 0,
    emailFailed: counts?.email_failed ?? 0,
    emailOtherSkipped: counts?.email_other_skipped ?? 0,
    emailQueued: counts?.email_queued ?? 0,
    maybeSent: counts?.email_maybe_sent ?? 0,
    bounces: deliveries?.bounces ?? 0,
    confirmedSent: deliveries?.confirmed_sent ?? 0,
    pushSent: deliveries?.push_sent ?? 0,
    pushTotal: deliveries?.push_total ?? 0,
    pendingRecipients: counts?.pending ?? 0,
  };
  const processing = row.campaignStatus === "processing";
  const oldestPendingError = deliveries?.oldest_pending_error ?? null;

  return {
    id: row.id,
    title: row.revisionTitle ?? row.title,
    campaignId: row.campaignId,
    campaignStatus: row.campaignStatus,
    // The send writes both in one statement; nothing keeps a row without it.
    sentAt: row.sentAt ?? row.campaignCreatedAt,
    sentByName: personName(row.sentBy),
    currentRevision: row.currentRevision,
    html: row.html ?? "",
    sendEmail: row.sendEmail,
    sendPush: row.sendPush,
    essential: row.essential,
    essentialReason: row.essentialReason,
    essentialConfirmedByName: personName(row.confirmedBy),
    essentialConfirmedAt: row.essentialConfirmedAt,
    retractedAt: row.retractedAt,
    retractedByName: personName(row.retractedBy),
    retractReason: row.retractReason,
    summary: parseComunicadoAudienceSummary(row.audienceSummary),
    kpis,
    banners: {
      configStalled:
        oldestPendingError !== null &&
        RESEND_CONFIG_ERRORS.has(oldestPendingError),
      quota: (counts?.email_quota ?? 0) > 0,
      stalledSince:
        processing && kpis.emailQueued > 0
          ? parseTimestamp(counts?.stalled_since ?? null)
          : null,
    },
    retractCounts: {
      people: kpis.recipients,
      queuedEmails: counts?.email_untried ?? 0,
      maybeSentEmails: kpis.maybeSent,
      sentEmails: kpis.emailSent,
    },
    retryCounts: {
      emails: counts?.email_retryable ?? 0,
      people: counts?.recipients_failed ?? 0,
      maybeSentEmails: counts?.email_failed_maybe_sent ?? 0,
    },
  };
}

export type ComunicadoRecipientRow = {
  userId: number;
  name: string;
  email: string;
  /** How they entered the audience; null on a row written without one. */
  source: ComunicadoRecipientSource | null;
  app: string;
  emailLabel: string;
  device: string;
};

type RecipientRow = {
  user_id: number;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  source: ComunicadoRecipientSource | null;
  status: ComunicadoRecipientStatus;
  skipped_reason: string | null;
  read_at: string | Date | null;
  email_status: ComunicadoEmailDelivery["status"] | null;
  email_error: string | null;
  email_maybe_sent: boolean | null;
  email_sent_at: string | Date | null;
  email_revision: number | null;
  unsubscribed_all: boolean;
  pushes: number;
  pushes_sent: number;
};

/** The chips (G6): each one a predicate over the same joined rows. */
const RECIPIENT_FILTER_SQL = {
  all: sql`true`,
  unread: sql`r.status = 'notified' AND n.read_at IS NULL`,
  email_not_sent: sql`d.status IN ('skipped', 'failed')`,
  skipped: sql`r.status = 'skipped'`,
  error: sql`r.status = 'failed' OR d.status = 'failed'`,
} as const satisfies Record<ComunicadoRecipientFilter, SQL>;

/** How the table orders people: by the name the dashboard shows, then id. */
const nameOrder = sql`lower(coalesce(
  nullif(btrim(${users.displayName}), ''),
  nullif(btrim(concat_ws(' ', ${users.firstName}, ${users.lastName})), ''),
  ${users.email}
)), r.user_id`;

function pageOf(page: number) {
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function pageCountOf(total: number) {
  return Math.max(1, Math.ceil(total / COMUNICADO_REPORT_PAGE_SIZE));
}

/**
 * One page of the recipients table, 50 at a time by name, with each row's
 * labels. A page past the end shows the last one. Null for anything but a
 * sent comunicado, or for anyone but a global admin.
 */
export async function fetchComunicadoRecipients(
  comunicadoId: number,
  opts: { filter: ComunicadoRecipientFilter; query: string; page: number },
): Promise<Paged<ComunicadoRecipientRow> | null> {
  if (!(await canRead())) return null;
  const [comunicado] = await db
    .select({
      campaignId: comunicados.campaignId,
      sendEmail: comunicados.sendEmail,
      sendPush: comunicados.sendPush,
      currentRevision: comunicados.currentRevision,
    })
    .from(comunicados)
    .where(
      and(eq(comunicados.id, comunicadoId), eq(comunicados.status, "sent")),
    )
    .limit(1);
  if (
    !comunicado ||
    comunicado.campaignId === null ||
    comunicado.currentRevision === null
  ) {
    return null;
  }

  const search = userSearchCondition(opts.query.trim().slice(0, SEARCH_MAX));
  // `users` keeps its own name: the search and the order refer to it.
  const source = sql`${recipientsWithLatestEmailSql}
    JOIN ${users} ON ${users.id} = r.user_id`;
  const where = sql`WHERE r.campaign_id = ${comunicado.campaignId}
    AND (${RECIPIENT_FILTER_SQL[opts.filter]})
    ${search ? sql`AND (${search})` : sql``}`;

  const totalResult = await db.execute<{ total: number }>(
    sql`SELECT count(*)::int AS total FROM ${source} ${where}`,
  );
  const total = totalResult.rows[0]?.total ?? 0;
  // Past the end (a filter emptied the last page, say): show the last page.
  const page = Math.min(pageOf(opts.page), pageCountOf(total));

  const result = await db.execute<RecipientRow>(sql`
    SELECT r.user_id,
      ${users.displayName} AS display_name,
      ${users.firstName} AS first_name,
      ${users.lastName} AS last_name,
      ${users.email} AS email,
      r.source, r.status, r.skipped_reason, n.read_at,
      d.status AS email_status,
      d.last_error AS email_error,
      d.maybe_sent_at IS NOT NULL AS email_maybe_sent,
      d.sent_at AS email_sent_at,
      d.content_revision AS email_revision,
      coalesce(d.last_error = 'unsubscribed' AND EXISTS (
        SELECT 1 FROM email_unsubscribes eu
        WHERE eu.email_key = lower(btrim(d.recipient_email))
          AND eu.topic = 'all'
      ), false) AS unsubscribed_all,
      coalesce(p.total, 0)::int AS pushes,
      coalesce(p.sent, 0)::int AS pushes_sent
    FROM ${source}
    LEFT JOIN LATERAL (
      SELECT count(*) AS total,
             count(*) FILTER (WHERE push.status = 'sent') AS sent
      FROM notification_deliveries push
      WHERE push.notification_id = n.id AND push.channel = 'push'
    ) p ON true
    ${where}
    ORDER BY ${nameOrder}
    LIMIT ${COMUNICADO_REPORT_PAGE_SIZE}
    OFFSET ${(page - 1) * COMUNICADO_REPORT_PAGE_SIZE}`);

  const { sendEmail, sendPush, currentRevision } = comunicado;
  return {
    rows: result.rows.map((row) => {
      const delivery: ComunicadoEmailDelivery | null = row.email_status
        ? {
            status: row.email_status,
            lastError: row.email_error,
            maybeSent: row.email_maybe_sent === true,
            sentAt: parseTimestamp(row.email_sent_at),
            contentRevision: row.email_revision,
          }
        : null;
      return {
        userId: Number(row.user_id),
        name:
          getUserName({
            displayName: row.display_name,
            firstName: row.first_name,
            lastName: row.last_name,
          }) || row.email,
        email: row.email,
        source: row.source,
        app: comunicadoAppLabel({
          status: row.status,
          skippedReason: row.skipped_reason,
          readAt: parseTimestamp(row.read_at),
        }),
        emailLabel: comunicadoEmailLabel({
          delivery,
          unsubscribedAll: row.unsubscribed_all,
          sendEmail,
          recipientStatus: row.status,
          currentRevision,
        }),
        device: comunicadoDeviceLabel({
          sendPush,
          notified: row.status === "notified",
          pushes: row.pushes,
          pushesSent: row.pushes_sent,
        }),
      };
    }),
    total,
    page,
    pageCount: pageCountOf(total),
  };
}
