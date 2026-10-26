import "server-only";

import { sql } from "drizzle-orm";
import type { CreateBatchEmailOptions } from "resend";

import { normalizeAnnouncementDoc } from "@/app/lib/comunicados/content";
import { parseComunicadoAudienceSummary } from "@/app/lib/comunicados/definitions";
import {
  type RenderedComunicadoEmail,
  renderComunicadoEmail,
} from "@/app/lib/comunicados/email";
import { comunicadoNotificationScope } from "@/app/lib/comunicados/env-scope";
import { lockComunicadoShared } from "@/app/lib/comunicados/locks";
import {
  announcementOptOutOverridden,
  comunicadoEmailExclusion,
} from "@/app/lib/emails/suppressions";
import { unsubscribeLinks } from "@/app/lib/emails/unsubscribe-links";
// Types only: the lane imports this file to register the renderer, so a
// runtime import back into it would be a cycle (D-2).
import type {
  BulkEmailPreparation,
  BulkEmailRenderer,
  BulkEmailTx,
  ClaimedBulkRow,
} from "@/app/lib/notifications/bulk-email";
import { publicBaseUrl } from "@/app/lib/urls";
import { getUserName } from "@/app/lib/users/utils";
import { serverEnv } from "@/env";

/**
 * A comunicado's emails on the bulk lane (docs/IMPLEMENTATION-comunicados.md
 * D3, D7, D8): the content lock, the per-row pre-check under it, and one
 * rendering per person of the revision that is current under that lock.
 *
 * The pre-check is an allowlist: a row with no recipient row, no source or
 * no profile is never mailed, and one whose person is being deleted, is no
 * longer eligible for how they entered the audience, or is a list member of a
 * send outside production is skipped. Addresses are only ever read in SQL,
 * never passed as parameters, so the query logger never prints one.
 */

/** One claimed row as the pre-check judged it. */
export type ComunicadoPrecheck = {
  id: number;
  /** A skip code, `address_changed`, or null when it may be sent. */
  skip: string | null;
  /** An essential send lifted this person's Anuncios opt-out (D7). */
  overridden: boolean;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
};

type RowToRender = ClaimedBulkRow & { check: ComunicadoPrecheck };

/**
 * The pre-check's verdicts as the lane's lists: `address_changed` fails, so
 * an admin can retry it to the address on file now; every other code skips;
 * a row the pre-check did not return, or one with no person or address to
 * mail, skips as `not_eligible`. What is left is rendered.
 */
export function preparationSkeleton(
  rows: readonly ClaimedBulkRow[],
  checks: readonly ComunicadoPrecheck[],
): {
  skipped: { id: number; code: string }[];
  failed: { id: number; code: string }[];
  toRender: RowToRender[];
} {
  const byId = new Map(checks.map((check) => [check.id, check]));
  const skipped: { id: number; code: string }[] = [];
  const failed: { id: number; code: string }[] = [];
  const toRender: RowToRender[] = [];
  for (const row of rows) {
    const check = byId.get(row.id);
    if (!check || row.userId == null || !row.recipientEmail) {
      skipped.push({ id: row.id, code: "not_eligible" });
    } else if (check.skip === "address_changed") {
      failed.push({ id: row.id, code: check.skip });
    } else if (check.skip) {
      skipped.push({ id: row.id, code: check.skip });
    } else {
      toRender.push({ ...row, check });
    }
  }
  return { skipped, failed, toRender };
}

/**
 * One person's email in the batch payload. Without `headers` (an essential
 * send to someone who left Anuncios), the email carries no one-click
 * unsubscribe: it would be a no-op that the mail client shows as done. The
 * footer link to the page explains the exception instead (D7, H6).
 */
export function comunicadoBatchEmail({
  to,
  rendered,
  headers,
  comunicadoId,
}: {
  to: string;
  rendered: RenderedComunicadoEmail;
  headers: Record<string, string> | null;
  comunicadoId: number;
}): CreateBatchEmailOptions {
  return {
    from: rendered.from,
    to: [to],
    replyTo: rendered.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    ...(headers ? { headers } : {}),
    tags: [
      { name: "category", value: "comunicado" },
      { name: "comunicado_id", value: String(comunicadoId) },
    ],
  };
}

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/** The sent comunicado behind a campaign, and its current revision. */
async function readContent(tx: BulkEmailTx, campaignId: number) {
  const { rows } = await tx.execute<{
    id: number;
    essential: boolean;
    audience_summary: unknown;
    current_revision: number | null;
    title: string | null;
    doc: unknown;
    action_label: string | null;
    action_path: string | null;
  }>(sql`
    SELECT k.id, k.essential, k.audience_summary, k.current_revision,
      rv.title, rv.doc, rv.action_label, rv.action_path
    FROM comunicados k
    LEFT JOIN comunicado_revisions rv
      ON rv.comunicado_id = k.id AND rv.revision = k.current_revision
    WHERE k.campaign_id = ${campaignId}::int
  `);
  const content = rows[0];
  if (!content) throw new Error("comunicado_not_found");
  if (content.current_revision == null || content.title == null) {
    throw new Error("comunicado_revision_not_found");
  }
  return {
    id: Number(content.id),
    essential: content.essential === true,
    summary: parseComunicadoAudienceSummary(content.audience_summary),
    revision: Number(content.current_revision),
    title: content.title,
    doc: content.doc,
    actionLabel: content.action_label,
    actionPath: content.action_path,
  };
}

/**
 * D3's pre-check, one statement for the whole claim: the first match wins.
 * `$sendingEnv` is this process's environment, so a list member's row that
 * slipped through is still not mailed from a preview.
 */
async function precheck(
  tx: BulkEmailTx,
  campaignId: number,
  rows: readonly ClaimedBulkRow[],
): Promise<ComunicadoPrecheck[]> {
  const sendingEnv = serverEnv.VERCEL_ENV;
  const owner = rows[0]!.leaseOwner;
  const { rows: checked } = await tx.execute<{
    id: number;
    skip: string | null;
    overridden: boolean | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
  }>(sql`
    SELECT d.id, CASE
      WHEN k.retracted_at IS NOT NULL OR n.retracted_at IS NOT NULL THEN 'retracted'
      WHEN u.id IS NULL OR r.id IS NULL THEN 'not_eligible'
      WHEN EXISTS (
        SELECT 1 FROM pending_user_deletions p
        WHERE p.user_id = u.id AND p.local_deleted_at IS NULL
      ) THEN 'deleting'
      WHEN NOT coalesce(
           (r.source = 'list' AND u.role = 'user' AND u.status IN ('verified', 'paused'))
        OR (r.source = 'person' AND ((u.role = 'user' AND u.status IN ('verified', 'paused'))
                                     OR (u.role = 'admin' AND u.status <> 'banned')))
        OR (r.source = 'staging_admin' AND u.role = 'admin' AND u.status <> 'banned'),
        false) THEN 'not_eligible'
      WHEN ${sendingEnv}::text <> 'production'
        AND r.source IS DISTINCT FROM 'person'
        AND r.source IS DISTINCT FROM 'staging_admin' THEN 'staging'
      WHEN lower(btrim(d.recipient_email)) <> lower(btrim(u.email)) THEN 'address_changed'
      ELSE ${comunicadoEmailExclusion(sql`d.recipient_email`, {
        essential: sql`k.essential`,
      })}
    END AS skip,
    ${announcementOptOutOverridden(sql`d.recipient_email`, sql`k.essential`)} AS overridden,
    u.first_name, u.last_name, u.display_name
    FROM notification_deliveries d
    JOIN notifications n ON n.id = d.notification_id
    JOIN comunicados k ON k.campaign_id = n.campaign_id
    LEFT JOIN users u ON u.id = d.user_id
    LEFT JOIN notification_campaign_recipients r
      ON r.campaign_id = n.campaign_id AND r.user_id = d.user_id
    WHERE d.id = ANY(${intArray(rows.map((row) => row.id))})
      AND d.lease_owner = ${owner}::text
      AND n.campaign_id = ${campaignId}::int
  `);
  return checked.map((row) => ({
    id: Number(row.id),
    skip: row.skip,
    overridden: row.overridden === true,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
  }));
}

/**
 * The renderer the lane uses for `template_key = 'comunicado'`
 * (`BULK_EMAIL_RENDERERS`). Every environment reads `VERCEL_ENV` when called,
 * never when this module loads.
 */
export const comunicadoBatchRenderer: BulkEmailRenderer = {
  /** Lane-wide, only the campaigns this environment sent (D9). */
  scope: () => comunicadoNotificationScope(serverEnv.VERCEL_ENV),

  /**
   * The comunicado's content lock, shared, so an edit or a retraction waits
   * for this batch, or the batch for it. Its own statement, keyed by the
   * comunicado id read first: the lock function is STRICT, and a missing id
   * would lock nothing. No comunicado fails closed, at the cost of an attempt.
   */
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
    const { skipped, failed, toRender } = preparationSkeleton(
      rows,
      await precheck(tx, campaignId, rows),
    );
    if (toRender.length === 0) return { skipped, failed, emails: [] };

    // Validated at the send; normalized again so the email renders exactly
    // the blocks the variant allows. A revision that no longer passes costs
    // the batch an attempt rather than mailing something broken.
    const normalized = normalizeAnnouncementDoc(content.doc, {
      stage: "send",
    });
    if (!normalized.ok) throw new Error("comunicado_doc_invalid");

    const startedAt = Date.now();
    const staging = serverEnv.VERCEL_ENV !== "production";
    const baseUrl = publicBaseUrl();
    // Frozen at the send (D-6): the note names the festival it was for.
    const essentialFestivalName = content.essential
      ? (content.summary?.essentialFestival?.name ?? null)
      : null;

    const emails: BulkEmailPreparation["emails"] = [];
    for (const row of toRender) {
      const links = unsubscribeLinks(
        { kind: "user", id: row.userId! },
        "announcements",
      );
      const rendered = await renderComunicadoEmail({
        title: content.title,
        blocks: normalized.blocks,
        actionLabel: content.actionLabel,
        actionPath: content.actionPath,
        greetingName: getUserName(row.check),
        unsubscribeUrl: links.pageUrl,
        essentialFestivalName,
        staging,
        test: false,
        baseUrl,
      });
      emails.push({
        id: row.id,
        email: comunicadoBatchEmail({
          to: row.recipientEmail!.trim(),
          rendered,
          headers: row.check.overridden ? null : links.headers,
          comunicadoId: content.id,
        }),
        revision: content.revision,
      });
    }

    // D10's measurement: if a batch of 100 takes seconds, render once per
    // revision instead.
    console.log("[comunicados] render", {
      campaignId,
      size: emails.length,
      ms: Date.now() - startedAt,
    });
    return { skipped, failed, emails };
  },
};
