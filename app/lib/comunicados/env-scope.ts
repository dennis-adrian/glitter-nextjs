import "server-only";

import { type SQL, sql } from "drizzle-orm";

import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";

/**
 * Campaigns a comunicado sent from `env` (D9). No index: comunicados is small.
 */
export function comunicadoCampaignsInEnvSql(
  campaignId: SQL,
  env: VercelEnvironment,
): SQL {
  return sql`${campaignId} IN (SELECT k.campaign_id FROM comunicados k
    WHERE k.campaign_id IS NOT NULL AND k.audience_summary->>'env' = ${env})`;
}

/**
 * The lane-wide scope for bulk email claims and bulk push, where the inbox
 * item is joined as `notifications`.
 */
export function comunicadoNotificationScope(env: VercelEnvironment): SQL {
  return comunicadoCampaignsInEnvSql(sql`"notifications"."campaign_id"`, env);
}
