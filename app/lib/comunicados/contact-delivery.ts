import "server-only";

import { sql } from "drizzle-orm";

import { normalizeAnnouncementDoc } from "@/app/lib/comunicados/content";
import { comunicadoCampaignsInEnvSql } from "@/app/lib/comunicados/env-scope";
import { comunicadoBatchEmail } from "@/app/lib/comunicados/delivery";
import { renderComunicadoEmail } from "@/app/lib/comunicados/email";
import { lockComunicadoShared } from "@/app/lib/comunicados/locks";
import { newsEmailExclusion } from "@/app/lib/emails/suppressions";
import { unsubscribeLinks } from "@/app/lib/emails/unsubscribe-links";
// Types only: the lane imports this file to register the renderer.
import type {
  BulkEmailPreparation,
  BulkEmailRenderer,
  BulkEmailTx,
  ClaimedBulkRow,
} from "@/app/lib/notifications/bulk-email";
import { publicBaseUrl } from "@/app/lib/urls";
import { serverEnv } from "@/env";

/**
 * A visitor comunicado's emails on the bulk lane
 * (docs/IMPLEMENTATION-comunicados.md §L): rows with no inbox item and no
 * user, one per contact of the frozen audience. The same content lock and
 * current-revision rendering as a participant comunicado (D3), with its own
 * pre-check and the "Novedades" topic for the one-click unsubscribe.
 *
 * The pre-check is an allowlist: a row whose contact is missing, or belongs
 * to another campaign, is never mailed; outside production only the admins
 * standing in for the contacts are. A suppression or an unsubscribe from
 * Novedades or from all bulk mail always skips: nothing overrides them.
 */

export type ContactPrecheck = {
  id: number;
  skip: string | null;
  contactId: number | null;
  name: string | null;
};

/**
 * The verdicts as the lane's lists. A row the pre-check did not return, or
 * one with no contact or address, skips as `not_eligible`.
 */
export function contactPreparationSkeleton(
  rows: readonly ClaimedBulkRow[],
  checks: readonly ContactPrecheck[],
) {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const skipped: { id: number; code: string }[] = [];
  const toRender: (ClaimedBulkRow & { check: ContactPrecheck })[] = [];
  for (const row of rows) {
    const check = byId.get(row.id);
    if (!check || check.contactId == null || !row.recipientEmail) {
      skipped.push({ id: row.id, code: "not_eligible" });
    } else if (check.skip) {
      skipped.push({ id: row.id, code: check.skip });
    } else {
      toRender.push({ ...row, check });
    }
  }
  return { skipped, toRender };
}

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

async function readContent(tx: BulkEmailTx, campaignId: number) {
  const { rows } = await tx.execute<{
    id: number;
    audience_kind: string;
    current_revision: number | null;
    title: string | null;
    doc: unknown;
    action_label: string | null;
    action_path: string | null;
  }>(sql`
    SELECT k.id, k.audience_kind, k.current_revision,
      rv.title, rv.doc, rv.action_label, rv.action_path
    FROM comunicados k
    LEFT JOIN comunicado_revisions rv
      ON rv.comunicado_id = k.id AND rv.revision = k.current_revision
    WHERE k.campaign_id = ${campaignId}::int
  `);
  const content = rows[0];
  if (!content) throw new Error("comunicado_not_found");
  if (content.audience_kind !== "visitors") {
    throw new Error("comunicado_not_for_visitors");
  }
  if (content.current_revision == null || content.title == null) {
    throw new Error("comunicado_revision_not_found");
  }
  return {
    id: Number(content.id),
    revision: Number(content.current_revision),
    title: content.title,
    doc: content.doc,
    actionLabel: content.action_label,
    actionPath: content.action_path,
  };
}

/** One statement for the whole claim; the first match wins. */
async function precheck(
  tx: BulkEmailTx,
  campaignId: number,
  rows: readonly ClaimedBulkRow[],
): Promise<ContactPrecheck[]> {
  const sendingEnv = serverEnv.VERCEL_ENV;
  const owner = rows[0]!.leaseOwner;
  const { rows: checked } = await tx.execute<{
    id: number;
    contact_id: number | null;
    skip: string | null;
    name: string | null;
  }>(sql`
    SELECT d.id, c.id AS contact_id, c.name, CASE
      WHEN k.retracted_at IS NOT NULL THEN 'retracted'
      WHEN c.id IS NULL OR c.status <> 'queued' THEN 'not_eligible'
      WHEN lower(btrim(d.recipient_email)) <> c.email_key THEN 'not_eligible'
      WHEN NOT coalesce(
           (c.source IN ('visitor', 'guest_buyer') AND ${sendingEnv}::text = 'production')
        OR (c.source = 'staging_admin' AND EXISTS (
              SELECT 1 FROM users u
              WHERE lower(btrim(u.email)) = c.email_key
                AND u.role = 'admin' AND u.status <> 'banned')),
        false) THEN CASE WHEN ${sendingEnv}::text <> 'production'
                         THEN 'staging' ELSE 'not_eligible' END
      ELSE ${newsEmailExclusion(sql`d.recipient_email`)}
    END AS skip
    FROM notification_deliveries d
    JOIN comunicados k ON k.campaign_id = d.campaign_id
    LEFT JOIN notification_campaign_contacts c
      ON c.id = (d.payload->>'contactId')::int AND c.campaign_id = d.campaign_id
    WHERE d.id = ANY(${intArray(rows.map((row) => row.id))})
      AND d.lease_owner = ${owner}::text
      AND d.campaign_id = ${campaignId}::int
      AND d.notification_id IS NULL
  `);
  return checked.map((row) => ({
    id: Number(row.id),
    contactId: row.contact_id == null ? null : Number(row.contact_id),
    skip: row.skip,
    name: row.name,
  }));
}

/** The renderer the lane uses for `template_key = 'comunicado_contact'`. */
export const comunicadoContactBatchRenderer: BulkEmailRenderer = {
  /** Lane-wide, only the campaigns this environment sent (D9). */
  scope: () =>
    comunicadoCampaignsInEnvSql(
      sql`"notification_deliveries"."campaign_id"`,
      serverEnv.VERCEL_ENV,
    ),

  retracted: () =>
    sql`EXISTS (SELECT 1 FROM comunicados k WHERE k.campaign_id = "notification_deliveries"."campaign_id" AND k.retracted_at IS NOT NULL)`,

  async lockContent(tx, campaignId) {
    const { rows } = await tx.execute<{ id: number }>(
      sql`SELECT id FROM comunicados WHERE campaign_id = ${campaignId}::int`,
    );
    const id = rows[0]?.id;
    if (id == null) throw new Error("comunicado_not_found");
    await lockComunicadoShared(tx, Number(id));
  },

  async prepare(tx, campaignId, rows): Promise<BulkEmailPreparation> {
    if (rows.length === 0) return { skipped: [], failed: [], emails: [] };
    const content = await readContent(tx, campaignId);
    const { skipped, toRender } = contactPreparationSkeleton(
      rows,
      await precheck(tx, campaignId, rows),
    );
    if (toRender.length === 0) return { skipped, failed: [], emails: [] };

    const normalized = normalizeAnnouncementDoc(content.doc, {
      stage: "send",
    });
    if (!normalized.ok) throw new Error("comunicado_doc_invalid");

    const staging = serverEnv.VERCEL_ENV !== "production";
    const baseUrl = publicBaseUrl();
    const emails: BulkEmailPreparation["emails"] = [];
    for (const row of toRender) {
      // Deterministic per contact, so a retried batch carries the same bytes.
      const links = unsubscribeLinks(
        { kind: "contact", id: row.check.contactId! },
        "news",
      );
      const rendered = await renderComunicadoEmail({
        title: content.title,
        blocks: normalized.blocks,
        actionLabel: content.actionLabel,
        actionPath: content.actionPath,
        greetingName: row.check.name,
        unsubscribeUrl: links.pageUrl,
        essentialFestivalName: null,
        staging,
        test: false,
        visitors: true,
        baseUrl,
      });
      emails.push({
        id: row.id,
        email: comunicadoBatchEmail({
          to: row.recipientEmail!.trim(),
          rendered,
          headers: links.headers,
          comunicadoId: content.id,
        }),
        revision: content.revision,
      });
    }
    return { skipped, failed: [], emails };
  },
};
