import "server-only";

import { randomUUID } from "crypto";

import { sql } from "drizzle-orm";

import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import {
  type ComunicadosTx,
  lockComunicadoShared,
} from "@/app/lib/comunicados/locks";
import { withSendRetry } from "@/app/lib/comunicados/send";
import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { db } from "@/db";
import { serverEnv } from "@/env";

/**
 * "Reintentar fallidos" on a sent comunicado
 * (docs/IMPLEMENTATION-comunicados.md G6, F4, V7): the people the fan-out
 * gave up on go back to pending, and everyone whose latest email failed
 * before it could have reached Resend gets a new bulk row. One transaction
 * under the comunicado's shared lock, so it and a retraction serialize and
 * whichever comes second sees the other. Delivering it is the driver's, so
 * only the environment that sent it retries it. Nothing here checks access:
 * the action does.
 */

export type RetryFailedOutcome =
  | { ok: true; campaignId: number; emails: number; people: number }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "NOT_SENT"
        | "RETRACTED"
        | "OTHER_ENV"
        | "NOTHING"
        | "LOCKED";
      message: string;
    };

type RetryRefusalCode = Extract<RetryFailedOutcome, { ok: false }>["code"];

const RETRY_MESSAGES = {
  NOT_FOUND: "No encontramos este comunicado.",
  NOT_SENT: "Este comunicado no se envió.",
  RETRACTED: "Este comunicado fue retirado.",
  OTHER_ENV:
    "Este comunicado se envió desde otro entorno: reintentalo desde allí.",
  NOTHING: "No hay nada para reintentar.",
  LOCKED: "No pudimos reintentarlo ahora. Probá de nuevo en unos segundos.",
} as const satisfies Record<RetryRefusalCode, string>;

function refusal(code: RetryRefusalCode): RetryFailedOutcome {
  return { ok: false, code, message: RETRY_MESSAGES[code] };
}

/**
 * G6's statements, in this order. `retryKey` names this call's email rows,
 * `notification:{nid}:email:retry:{retryKey}`.
 */
async function retryInTransaction(
  tx: ComunicadosTx,
  comunicadoId: number,
  by: number,
  retryKey: string,
  env: VercelEnvironment,
): Promise<RetryFailedOutcome> {
  await tx.execute(sql`SET LOCAL lock_timeout = '20s'`);
  // Before any row lock: an edit or a retraction takes its exclusive lock
  // first and the comunicado's row after it, so the other order deadlocks.
  await lockComunicadoShared(tx, comunicadoId);

  // No FOR UPDATE, for the same reason: the shared lock already keeps a
  // retraction out until this commits.
  const { rows } = await tx.execute<{
    status: string;
    campaign_id: number | null;
    retracted: boolean;
    same_env: boolean;
  }>(sql`
    SELECT status, campaign_id, retracted_at IS NOT NULL AS retracted,
      (audience_summary->>'env') IS NOT DISTINCT FROM ${env}::text AS same_env
    FROM comunicados WHERE id = ${comunicadoId}::int
  `);
  const row = rows[0];
  if (!row) return refusal("NOT_FOUND");
  if (row.status !== "sent" || row.campaign_id == null) {
    return refusal("NOT_SENT");
  }
  if (row.retracted) return refusal("RETRACTED");
  // The run after it drains the campaign with this server's narrowing, and
  // development only simulates: another environment's people would end up
  // skipped, or recorded as sent with nothing sent, for good (D9).
  if (!row.same_env) return refusal("OTHER_ENV");
  const campaignId = Number(row.campaign_id);

  // A completion holds this row while it checks, and a second retry waits
  // here: each statement below reads, fresh, whatever the other committed.
  await tx.execute(sql`
    SELECT id FROM notification_campaigns
    WHERE id = ${campaignId}::int
    FOR UPDATE
  `);

  const { rows: people } = await tx.execute<{ id: number }>(sql`
    UPDATE notification_campaign_recipients
    SET status = 'pending', attempts = 0, last_error = NULL,
      processed_at = NULL
    WHERE campaign_id = ${campaignId}::int AND status = 'failed'
    RETURNING id
  `);

  // Only a latest email that failed with no attempt that may have landed
  // (V7). The address is read in SQL, never sent as a parameter, and the
  // failed row stays as it was, linked from the new one.
  const { rows: emails } = await tx.execute<{ id: number }>(sql`
    INSERT INTO notification_deliveries
      (notification_id, user_id, template_key, channel, lane,
       recipient_email, payload, idempotency_key, resend_of_delivery_id,
       requested_by_user_id)
    SELECT n.id, n.user_id, 'comunicado',
      'email'::notification_delivery_channel,
      'bulk'::notification_delivery_lane,
      btrim(u.email), jsonb_build_object('comunicadoId', ${comunicadoId}::int),
      'notification:' || n.id || ':email:retry:' || ${retryKey}::text,
      d.id, ${by}::int
    FROM notifications n
    JOIN LATERAL (
      SELECT d.id, d.status, d.maybe_sent_at
      FROM notification_deliveries d
      WHERE d.notification_id = n.id AND d.channel = 'email'
      ORDER BY d.id DESC
      LIMIT 1
    ) d ON true
    JOIN users u ON u.id = n.user_id
    WHERE n.campaign_id = ${campaignId}::int AND n.kind = 'comunicado'
      AND n.retracted_at IS NULL
      AND d.status = 'failed' AND d.maybe_sent_at IS NULL
      AND btrim(u.email) <> ''
    ORDER BY n.id
    RETURNING id
  `);

  // Both wrote nothing: the campaign stays as it is, completed or not.
  if (people.length + emails.length === 0) return refusal("NOTHING");

  await tx.execute(sql`
    UPDATE notification_campaigns
    SET status = 'processing', completed_at = NULL, updated_at = now()
    WHERE id = ${campaignId}::int
  `);
  return {
    ok: true,
    campaignId,
    emails: emails.length,
    people: people.length,
  };
}

/**
 * "Reintentar fallidos (N)" (G6): a sent comunicado that is not retracted,
 * from the environment that sent it.
 * A deadlock or a profile deletion committing under it (40P01, 23503)
 * retries once; a lock held past the timeout answers "probá de nuevo". Logs
 * ids and counts only (I4).
 */
export async function retryFailedComunicado(
  comunicadoId: number,
  by: number,
): Promise<RetryFailedOutcome> {
  const retryKey = randomUUID();
  const env = serverEnv.VERCEL_ENV;
  let outcome: RetryFailedOutcome;
  try {
    outcome = await withSendRetry(() =>
      db.transaction((tx) =>
        retryInTransaction(tx, comunicadoId, by, retryKey, env),
      ),
    );
  } catch (error) {
    if (hasPgErrorCode(error, "55P03")) return refusal("LOCKED");
    throw error;
  }

  if (outcome.ok) {
    console.log("[comunicados] retry", {
      comunicadoId,
      campaignId: outcome.campaignId,
      emails: outcome.emails,
      people: outcome.people,
    });
  }
  return outcome;
}
