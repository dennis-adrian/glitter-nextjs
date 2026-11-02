import "server-only";

import { type SQL, sql } from "drizzle-orm";

import type { Executor } from "@/app/lib/comunicados/audience";
import type { ComunicadoAudiencePreview } from "@/app/lib/comunicados/audience";
import {
  COMUNICADO_CONTACT_SKIP_REASONS,
  COMUNICADO_CONTACTS_SOURCE_LABEL,
  COMUNICADO_VISITOR_MAX_RECIPIENTS,
} from "@/app/lib/comunicados/definitions";
import type { ComunicadosTx } from "@/app/lib/comunicados/locks";
import { newsEmailExclusion } from "@/app/lib/emails/suppressions";

/**
 * Who a visitor comunicado reaches (docs/IMPLEMENTATION-comunicados.md §L):
 * every visitor of every festival and every guest merch buyer, once per
 * normalized address, email only, under the "Novedades" topic. One SQL
 * resolver for the composer's counts, the confirm dialog and the send's
 * snapshot, as the participant audience has (B2–B4).
 *
 * The audience is a source, `all_contacts`, judged the same way whatever
 * produced it, so a frozen copy of it can later be one more source without
 * changing the rules below.
 */

/** The template key of a visitor comunicado's email rows on the bulk lane. */
export const COMUNICADO_CONTACT_TEMPLATE_KEY = "comunicado_contact";

export type ContactAudienceInput = {
  /** Outside production (B6); the server's own environment. */
  narrow: boolean;
};

/**
 * Loose on purpose, as `isDeliverableEmail` is: it only keeps out what Resend
 * would refuse. The lane checks the strict rule again before sending.
 */
const DELIVERABLE_SQL = `'^[^[:space:]@<>(),;:"]+@[^[:space:]@<>(),;:"]+\\.[^[:space:]@<>(),;:"]+$'`;

/**
 * `judged`: one row per address, with how it entered (`source`), what it
 * would be before narrowing (`base_reason`) and after (`reason`). Labels are
 * the admin's words, stored as `skipped_reason`.
 *
 * - Visitors are unique only by email as typed, and guest orders repeat, so
 *   everything is grouped on `lower(trim(email))`. A visitor row wins over a
 *   guest order for the address, the name and the source; the oldest visitor
 *   row is the canonical one, as the invitation mailing reads it.
 * - Consent: a record answered "Quiero recibir novedades" with true, or
 *   predates the question (null). An address is left out only when every
 *   record of it said no, so a contact from before the question keeps its
 *   assumed consent.
 * - An address that also has an account is still one contact, mailed here as
 *   a visitor.
 * - Outside production, the contacts are skipped and the global admins
 *   stand in for them, as for the participant lists (B6).
 */
function judgedCtes(input: ContactAudienceInput): SQL {
  const r = COMUNICADO_CONTACT_SKIP_REASONS;
  const stagingArm = input.narrow
    ? sql`UNION ALL
      SELECT lower(btrim(u.email)), btrim(u.email), u.first_name, NULL::int,
             'staging_admin', NULL::boolean, 0, u.id
      FROM users u
      WHERE u.role = 'admin' AND u.status <> 'banned'
        AND btrim(coalesce(u.email, '')) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM pending_user_deletions p
          WHERE p.user_id = u.id AND p.local_deleted_at IS NULL
        )`
    : sql``;
  return sql`
    records AS (
      SELECT lower(btrim(v.email)) AS email_key, btrim(v.email) AS email,
             nullif(btrim(v.first_name), '') AS name, v.id AS visitor_id,
             'visitor' AS source, v.news_opt_in AS opt_in,
             1 AS rank, v.id AS ord
      FROM visitors v
      WHERE btrim(v.email) <> ''
      UNION ALL
      SELECT lower(btrim(o.guest_email)), btrim(o.guest_email),
             nullif(split_part(btrim(o.guest_name), ' ', 1), ''), NULL::int,
             'guest_buyer', o.guest_news_opt_in, 2, -o.id
      FROM orders o
      WHERE o.user_id IS NULL AND btrim(coalesce(o.guest_email, '')) <> ''
      ${stagingArm}
    ),
    grouped AS (
      SELECT email_key,
        (array_agg(email ORDER BY rank, ord))[1] AS email,
        (array_agg(name ORDER BY rank, ord) FILTER (WHERE name IS NOT NULL))[1] AS name,
        (array_agg(visitor_id ORDER BY ord) FILTER (WHERE visitor_id IS NOT NULL))[1] AS visitor_id,
        (array_agg(source ORDER BY rank, ord))[1] AS source,
        bool_or(source = 'staging_admin') AS is_staging_admin,
        bool_or(source <> 'staging_admin') AS is_contact,
        bool_or(source <> 'staging_admin' AND opt_in IS DISTINCT FROM false) AS consented
      FROM records
      GROUP BY email_key
    ),
    judged AS (
      SELECT g.*, b.base_reason,
        CASE
          WHEN g.is_staging_admin THEN
            CASE WHEN g.email !~ ${sql.raw(DELIVERABLE_SQL)} THEN ${r.invalid}::text
                 WHEN ${newsEmailExclusion(sql`g.email`)} = 'suppressed' THEN ${r.suppressed}::text
                 WHEN ${newsEmailExclusion(sql`g.email`)} = 'unsubscribed' THEN ${r.unsubscribed}::text
            END
          WHEN b.base_reason IS NULL AND ${sql.raw(input.narrow ? "true" : "false")}
            THEN ${r.staging}::text
          ELSE b.base_reason
        END AS reason,
        CASE WHEN g.is_staging_admin THEN 'staging_admin' ELSE g.source END AS final_source
      FROM grouped g
      CROSS JOIN LATERAL (
        SELECT CASE
          WHEN NOT g.is_contact THEN NULL
          WHEN g.email !~ ${sql.raw(DELIVERABLE_SQL)} THEN ${r.invalid}::text
          WHEN NOT g.consented THEN ${r.noConsent}::text
          WHEN ${newsEmailExclusion(sql`g.email`)} = 'suppressed' THEN ${r.suppressed}::text
          WHEN ${newsEmailExclusion(sql`g.email`)} = 'unsubscribed' THEN ${r.unsubscribed}::text
        END AS base_reason
      ) b
    )`;
}

type CountsRow = {
  matched: number;
  eligible: number;
  will_receive: number;
  staging_admins: number;
  visitors: number;
  guest_buyers: number;
  skipped: { reason: string; count: number }[];
};

/** Counts over `judged`, or over the rows a snapshot inserted. */
function countsSelect(rows: "judged" | "inserted"): SQL {
  const from = sql.raw(rows);
  const status =
    rows === "judged"
      ? sql.raw("(CASE WHEN reason IS NULL THEN 'queued' ELSE 'skipped' END)")
      : sql.raw("status::text");
  const reason = sql.raw(rows === "judged" ? "reason" : "skipped_reason");
  const source = sql.raw(rows === "judged" ? "final_source" : "source::text");
  return sql`
    (SELECT count(*) FROM judged WHERE is_contact)::int AS matched,
    (SELECT count(*) FROM judged WHERE is_contact AND base_reason IS NULL)::int AS eligible,
    (SELECT count(*) FROM ${from} WHERE ${status} = 'queued')::int AS will_receive,
    (SELECT count(*) FROM ${from}
     WHERE ${status} = 'queued' AND ${source} = 'staging_admin')::int AS staging_admins,
    (SELECT count(*) FROM judged WHERE is_contact AND source = 'visitor')::int AS visitors,
    (SELECT count(*) FROM judged WHERE is_contact AND source = 'guest_buyer')::int AS guest_buyers,
    (SELECT coalesce(json_agg(json_build_object('reason', s.reason, 'count', s.n)
                              ORDER BY s.n DESC, s.reason), '[]'::json)
     FROM (SELECT ${reason} AS reason, count(*)::int AS n FROM ${from}
           WHERE ${status} = 'skipped' GROUP BY ${reason}) s) AS skipped`;
}

export type ContactAudienceCounts = {
  /** Distinct addresses among visitors and guest buyers, before narrowing. */
  matched: number;
  /** "Pueden recibirlo hoy", before narrowing: the cap and the typed count. */
  eligible: number;
  /** Rows the send writes `queued`, after narrowing. */
  willReceive: number;
  /** Among them, the admins standing in for the contacts. */
  stagingAdmins: number;
  /** Among `matched`, by how they entered. */
  visitors: number;
  guestBuyers: number;
  /** Who would not receive it, by label, most first. */
  skipped: { reason: string; count: number }[];
};

function toCounts(row: CountsRow): ContactAudienceCounts {
  return {
    matched: row.matched,
    eligible: row.eligible,
    willReceive: row.will_receive,
    stagingAdmins: row.staging_admins,
    visitors: row.visitors,
    guestBuyers: row.guest_buyers,
    skipped: row.skipped,
  };
}

/** The counts the composer and the confirm dialog show; writes nothing. */
export async function countContactAudience(
  executor: Executor,
  input: ContactAudienceInput,
): Promise<ContactAudienceCounts> {
  const result = await executor.execute<CountsRow>(
    sql`WITH ${judgedCtes(input)} SELECT ${countsSelect("judged")}`,
  );
  return toCounts(result.rows[0]!);
}

/**
 * The counts in the shape the participant composer and dialog read
 * (`ComunicadoAudiencePreview`): one source, email only. Everyone who would
 * receive it is someone the email goes to, since the opt-outs and the
 * suppressions are already skips here.
 */
export function contactAudiencePreview(
  counts: ContactAudienceCounts,
  narrow: boolean,
): ComunicadoAudiencePreview {
  const skippedTotal = counts.skipped.reduce((sum, s) => sum + s.count, 0);
  return {
    sources: [
      {
        kind: "contacts",
        id: null,
        label: COMUNICADO_CONTACTS_SOURCE_LABEL,
        count: {
          eligible: counts.eligible,
          skipped: counts.matched - counts.eligible,
        },
        problem: null,
      },
    ],
    matched: counts.matched,
    eligible: counts.eligible,
    overlap: 0,
    skipped: counts.skipped,
    skippedTotal,
    willReceive: counts.willReceive,
    email: {
      sendTo: counts.willReceive,
      unsubscribedAnnouncements: 0,
      unsubscribedAll: 0,
      suppressed: 0,
      invalid: 0,
      essentialOverride: 0,
    },
    pushDevices: 0,
    pushSubscriptions: 0,
    tooLarge: counts.eligible > COMUNICADO_VISITOR_MAX_RECIPIENTS,
    narrowed: narrow,
    stagingAdmins: counts.stagingAdmins,
    essentialAllowed: { ok: false, reason: null, festival: null },
  };
}

/**
 * The snapshot, inside the send transaction: one contact row per address,
 * `queued` or `skipped` with its label, then one bulk email row per queued
 * contact, with no inbox item and no user, linked both ways. Addresses are
 * only ever read in SQL, never passed as parameters, so the query logger
 * never prints one.
 */
export async function snapshotComunicadoContacts(
  tx: ComunicadosTx,
  campaignId: number,
  comunicadoId: number,
  input: ContactAudienceInput,
): Promise<ContactAudienceCounts> {
  const result = await tx.execute<CountsRow>(sql`
    WITH ${judgedCtes(input)},
    inserted AS (
      INSERT INTO notification_campaign_contacts
        (campaign_id, email_key, email, name, visitor_id, source, status, skipped_reason)
      SELECT ${campaignId}::int, j.email_key, j.email, j.name, j.visitor_id,
             j.final_source::campaign_contact_source,
             (CASE WHEN j.reason IS NULL THEN 'queued' ELSE 'skipped' END)
               ::campaign_contact_status,
             j.reason
      FROM judged j
      ORDER BY j.email_key
      RETURNING status, skipped_reason, source
    )
    SELECT ${countsSelect("inserted")}`);
  const counts = toCounts(result.rows[0]!);

  // Its own statement: a data-modifying CTE does not see the rows another
  // one inserted.
  await tx.execute(sql`
    WITH written AS (
      INSERT INTO notification_deliveries
        (campaign_id, template_key, channel, lane, recipient_email, payload, idempotency_key)
      SELECT c.campaign_id, ${COMUNICADO_CONTACT_TEMPLATE_KEY}::text, 'email', 'bulk', c.email,
             jsonb_build_object('comunicadoId', ${comunicadoId}::int, 'contactId', c.id),
             'comunicado:' || ${comunicadoId}::int || ':contact:' || c.id || ':email'
      FROM notification_campaign_contacts c
      WHERE c.campaign_id = ${campaignId}::int AND c.status = 'queued'
      ORDER BY c.id
      RETURNING id, (payload->>'contactId')::int AS contact_id
    )
    UPDATE notification_campaign_contacts c SET delivery_id = w.id
    FROM written w WHERE c.id = w.contact_id`);
  return counts;
}
