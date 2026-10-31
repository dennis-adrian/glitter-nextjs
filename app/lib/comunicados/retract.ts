import "server-only";

import { sql } from "drizzle-orm";

import { completeComunicadoIfDone } from "@/app/lib/comunicados/fanout";
import {
  type ComunicadosTx,
  lockComunicadoExclusive,
} from "@/app/lib/comunicados/locks";
import { COMUNICADO_RETRACTED_SKIP_REASON } from "@/app/lib/comunicados/skip-reasons";
import { hasPgErrorCode } from "@/app/lib/errors/postgres";
import { db } from "@/db";

/**
 * Retracting a sent comunicado (docs/IMPLEMENTATION-comunicados.md F3, F4,
 * V3, V4, V10): it leaves every inbox, read or not, and whatever has not gone
 * out yet never does. One transaction under the comunicado's exclusive lock,
 * so it waits for the fan-out chunk or email batch in flight and every later
 * one finds it retracted. Nothing here checks access: the action does.
 */

export type RetractComunicadoOutcome =
  | {
      ok: true;
      campaignId: number;
      /** Nothing was left to send, so the campaign closed here (D2). */
      completed: boolean;
      /** Inbox items it took out. */
      hidden: number;
      /** Email and push rows it cancelled. */
      skippedDeliveries: number;
      /** People the fan-out had not reached yet. */
      skippedRecipients: number;
    }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOT_SENT" | "ALREADY_RETRACTED" | "LOCKED" | "BUSY";
      message: string;
    };

type RetractRefusalCode = Extract<
  RetractComunicadoOutcome,
  { ok: false }
>["code"];

const RETRACT_MESSAGES = {
  NOT_FOUND: "No encontramos este comunicado.",
  NOT_SENT: "Este comunicado no se envió.",
  ALREADY_RETRACTED: "Este comunicado ya fue retirado.",
  LOCKED:
    "Se están enviando correos de este comunicado en este momento. Probá de nuevo en unos segundos.",
  BUSY: "No pudimos retirarlo. Probá de nuevo.",
} as const satisfies Record<RetractRefusalCode, string>;

function refusal(code: RetractRefusalCode): RetractComunicadoOutcome {
  return { ok: false, code, message: RETRACT_MESSAGES[code] };
}

/**
 * F3's steps, in this order. The batch in flight holds the shared lock across
 * its Resend request, so the wait is at most about 15 s; 20 s of
 * `lock_timeout` covers it.
 */
async function retractInTransaction(
  tx: ComunicadosTx,
  comunicadoId: number,
  reason: string,
  by: number,
): Promise<RetractComunicadoOutcome> {
  await tx.execute(sql`SET LOCAL lock_timeout = '20s'`);
  await lockComunicadoExclusive(tx, comunicadoId);

  const { rows } = await tx.execute<{
    status: string;
    campaign_id: number | null;
    retracted: boolean;
  }>(sql`
    SELECT status, campaign_id, retracted_at IS NOT NULL AS retracted
    FROM comunicados WHERE id = ${comunicadoId}::int
    FOR UPDATE
  `);
  const row = rows[0];
  if (!row) return refusal("NOT_FOUND");
  if (row.status !== "sent" || row.campaign_id == null) {
    return refusal("NOT_SENT");
  }
  if (row.retracted) return refusal("ALREADY_RETRACTED");
  const campaignId = Number(row.campaign_id);

  await tx.execute(sql`
    UPDATE comunicados
    SET retracted_at = now(), retracted_by_user_id = ${by}::int,
      retract_reason = ${reason}::text, version = version + 1,
      updated_at = now(), updated_by_user_id = ${by}::int
    WHERE id = ${comunicadoId}::int
  `);

  // Archived as well, which every inbox read already hides and the CHECK
  // keeps; `read_at` stays for the report.
  const { rows: hidden } = await tx.execute<{ id: number }>(sql`
    UPDATE notifications
    SET archived_at = coalesce(archived_at, now()), retracted_at = now()
    WHERE campaign_id = ${campaignId}::int AND kind = 'comunicado'
      AND retracted_at IS NULL
    RETURNING id
  `);

  // Pending rows only, email and push. A `processing` row is left to the
  // attempt holding it, whose settle checks only its lease and would
  // overwrite this: a batch meets `retracted` in its pre-check, or its claim
  // is handed back as skipped; a push is delivered, or skips as retracted.
  const { rows: deliveries } = await tx.execute<{ id: number }>(sql`
    UPDATE notification_deliveries d
    SET status = 'skipped', last_error = 'retracted', updated_at = now()
    FROM notifications n
    WHERE d.notification_id = n.id AND n.campaign_id = ${campaignId}::int
      AND d.status = 'pending'
    RETURNING d.id
  `);

  // Later chunks see `retracted_at` under the shared lock and stop.
  const { rows: recipients } = await tx.execute<{ id: number }>(sql`
    UPDATE notification_campaign_recipients
    SET status = 'skipped',
      skipped_reason = ${COMUNICADO_RETRACTED_SKIP_REASON}::text,
      processed_at = now()
    WHERE campaign_id = ${campaignId}::int AND status = 'pending'
    RETURNING id
  `);

  // Last, under the exclusive lock, so its checks are exact. A claim still
  // processing keeps it open for the next driver or the sweep.
  const completed = await completeComunicadoIfDone(tx, campaignId);

  return {
    ok: true,
    campaignId,
    completed,
    hidden: hidden.length,
    skippedDeliveries: deliveries.length,
    skippedRecipients: recipients.length,
  };
}

/**
 * "Retirar…" (F3): a sent comunicado, once. A deadlock, with a profile
 * deletion or another writer, retries once (F4); a second one, or a batch
 * holding the lock past the timeout, answers "probá de nuevo". `reason` is
 * the team's, already trimmed and bounded by the action. Logs ids and counts
 * only (I4).
 */
export async function retractComunicado(
  id: number,
  { reason }: { reason: string },
  by: number,
): Promise<RetractComunicadoOutcome> {
  const attempt = () =>
    db.transaction((tx) => retractInTransaction(tx, id, reason, by));

  let outcome: RetractComunicadoOutcome;
  try {
    try {
      outcome = await attempt();
    } catch (error) {
      if (!hasPgErrorCode(error, "40P01")) throw error;
      outcome = await attempt();
    }
  } catch (error) {
    if (hasPgErrorCode(error, "55P03")) return refusal("LOCKED");
    if (hasPgErrorCode(error, "40P01")) return refusal("BUSY");
    throw error;
  }

  if (outcome.ok) {
    console.log("[comunicados] retract", {
      comunicadoId: id,
      campaignId: outcome.campaignId,
      hidden: outcome.hidden,
      skippedDeliveries: outcome.skippedDeliveries,
      skippedRecipients: outcome.skippedRecipients,
      completed: outcome.completed,
    });
  }
  return outcome;
}
