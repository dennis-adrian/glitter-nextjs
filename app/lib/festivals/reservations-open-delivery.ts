import "server-only";

import { render } from "react-email";
import { type SQL, sql } from "drizzle-orm";

import ReservationsOpenEmailTemplate, {
  reservationsOpenSubject,
} from "@/app/emails/reservations-open";
import { bulkMailExclusion } from "@/app/lib/emails/suppressions";
import type { MailingTopic } from "@/app/lib/emails/topics";
import { unsubscribeLinks } from "@/app/lib/emails/unsubscribe-links";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
// Types only: the lane imports this file to register the renderer, so a
// runtime import back into it would be a cycle.
import type {
  BulkEmailPreparation,
  BulkEmailRenderer,
} from "@/app/lib/notifications/bulk-email";
import { publicBaseUrl } from "@/app/lib/urls";
import { getUserName } from "@/app/lib/users/utils";
import { serverEnv } from "@/env";

/**
 * The "reservations are open" email on the bulk lane
 * (`template_key = 'festival_reservations_open'`). Each send is a campaign
 * with a row in `festival_reservations_open_notices`; the lane batches its
 * rows and this renders them.
 *
 * The pre-check is an allowlist, as a comunicado's is: a row is mailed only
 * while its person is still a verified participant, is not being deleted,
 * still has the address it was queued for, and has not bounced or
 * unsubscribed from participant announcements. Addresses are only read in
 * SQL, never passed as parameters.
 */

export const RESERVATIONS_OPEN_TEMPLATE_KEY = "festival_reservations_open";

/** The list a participant leaves from this email's footer: the activation's. */
export const RESERVATIONS_OPEN_TOPIC: MailingTopic = "participant_invitations";

const FROM = "Productora Glitter <eventos@productoraglitter.com>";

/** Campaigns of notices sent from `env`, as a claim's or a push's scope. */
export function reservationsOpenCampaignsInEnv(
  campaignId: SQL,
  env: string,
): SQL {
  return sql`${campaignId} IN (SELECT o.campaign_id
    FROM festival_reservations_open_notices o WHERE o.env = ${env}::text)`;
}

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

type Checked = {
  id: number;
  skip: string | null;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  festival_id: number | null;
  festival_name: string | null;
  festival_type: FestivalBase["festivalType"] | null;
};

export const reservationsOpenBatchRenderer: BulkEmailRenderer = {
  /** Lane-wide, only the notices this environment sent. */
  scope: () =>
    reservationsOpenCampaignsInEnv(
      sql`"notifications"."campaign_id"`,
      serverEnv.VERCEL_ENV,
    ),

  /** Nothing to lock: a notice's content never changes once sent. */
  async lockContent() {},

  async prepare(tx, campaignId, rows): Promise<BulkEmailPreparation> {
    if (rows.length === 0) return { skipped: [], failed: [], emails: [] };
    const owner = rows[0]!.leaseOwner;
    const exclusion = bulkMailExclusion(
      sql`d.recipient_email`,
      RESERVATIONS_OPEN_TOPIC,
    );
    const { rows: checked } = await tx.execute<Checked>(sql`
      SELECT d.id,
        CASE
          WHEN n.retracted_at IS NOT NULL THEN 'retracted'
          WHEN u.id IS NULL OR f.id IS NULL THEN 'not_eligible'
          WHEN EXISTS (
            SELECT 1 FROM pending_user_deletions p
            WHERE p.user_id = u.id AND p.local_deleted_at IS NULL
          ) THEN 'deleting'
          WHEN u.status <> 'verified' OR u.role <> 'user' THEN 'not_eligible'
          WHEN lower(btrim(d.recipient_email)) <> lower(btrim(u.email))
            THEN 'address_changed'
          ELSE ${exclusion}
        END AS skip,
        u.display_name, u.first_name, u.last_name,
        f.id AS festival_id, f.name AS festival_name,
        f.festival_type
      FROM notification_deliveries d
      JOIN notifications n ON n.id = d.notification_id
      JOIN festival_reservations_open_notices o
        ON o.campaign_id = n.campaign_id
      LEFT JOIN festivals f ON f.id = o.festival_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.id = ANY(${intArray(rows.map((row) => row.id))})
        AND d.lease_owner = ${owner}::text
        AND n.campaign_id = ${campaignId}::int
    `);

    const byId = new Map(checked.map((row) => [Number(row.id), row]));
    const result: BulkEmailPreparation = {
      skipped: [],
      failed: [],
      emails: [],
    };
    const baseUrl = publicBaseUrl();
    for (const row of rows) {
      const check = byId.get(row.id);
      if (
        !check ||
        row.userId == null ||
        !row.recipientEmail ||
        check.festival_id == null
      ) {
        result.skipped.push({ id: row.id, code: "not_eligible" });
        continue;
      }
      if (check.skip === "address_changed") {
        result.failed.push({ id: row.id, code: check.skip });
        continue;
      }
      if (check.skip) {
        result.skipped.push({ id: row.id, code: check.skip });
        continue;
      }

      // The name as it was sent, so a renamed festival reads the same as
      // the inbox item next to it.
      const payload = row.payload as { festivalName?: unknown } | null;
      const festivalName =
        typeof payload?.festivalName === "string"
          ? payload.festivalName
          : (check.festival_name ?? "");
      const festival = {
        id: Number(check.festival_id),
        name: festivalName,
        festivalType: check.festival_type ?? "glitter",
      };
      const links = unsubscribeLinks(
        { kind: "user", id: row.userId },
        RESERVATIONS_OPEN_TOPIC,
      );
      const html = await render(
        ReservationsOpenEmailTemplate({
          name: getUserName({
            displayName: check.display_name,
            firstName: check.first_name,
            lastName: check.last_name,
          }),
          festival,
          baseUrl,
          unsubscribeUrl: links.pageUrl,
        }),
      );
      result.emails.push({
        id: row.id,
        email: {
          from: FROM,
          to: [row.recipientEmail.trim()],
          subject: reservationsOpenSubject(festivalName),
          html,
          headers: links.headers,
          tags: [
            { name: "category", value: "festival_reservations_open" },
            { name: "festival_id", value: String(festival.id) },
          ],
        },
        revision: null,
      });
    }
    return result;
  },
};
