import "server-only";

import { sql } from "drizzle-orm";

import type { SendRefusalCode } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_RELEASES_PER_TICK,
  COMUNICADO_UNTITLED,
} from "@/app/lib/comunicados/definitions";
import type { ComunicadosTx } from "@/app/lib/comunicados/locks";
import { missedDetailOf, missedReasonOf } from "@/app/lib/comunicados/missed";
import {
  SendRefusal,
  startComunicadoSend,
  type StartComunicadoSendResult,
  withSendRetry,
} from "@/app/lib/comunicados/send";
import { errorCode } from "@/app/lib/notifications/bulk-email";
import {
  comunicadoNotSentBody,
  type ComunicadoNotSentData,
} from "@/app/lib/notifications/kinds/comunicado";
import { notifyMany } from "@/app/lib/notifications/notify";
import { db } from "@/db";

/**
 * Releasing due schedules (docs/IMPLEMENTATION-comunicados.md E2–E4, G9): step
 * 1 of the lane's work. Each due comunicado is claimed with `SKIP LOCKED` and
 * sent in that same transaction, as whoever scheduled it, so an overlapping
 * run, "Enviar ahora" or a cancel each find it locked or already settled.
 * A refusal with a missed reason turns it back into a draft, with a bell item
 * for the admins; anything else leaves it scheduled for the next tick.
 * Nothing here checks access: the cron and the button do.
 */

export type ReleaseRun = {
  released: number;
  /** Turned back into drafts, with a bell item (E4). */
  missed: number;
  /** Unexpected errors: still scheduled, tried again next tick. */
  failed: number;
  /** The campaigns this run started, for the driver to close. */
  campaignIds: number[];
  /** Every comunicado this run claimed, in order: none is claimed twice. */
  triedIds: number[];
};

/** A release needs about this long; with less left, the next tick takes it. */
const RELEASE_RESERVE_MS = 10_000;

type Claim = { id: number; version: number; scheduledAt: Date };

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/**
 * The oldest due schedule nobody else holds and this run has not tried yet
 * (E2), locked until the transaction ends. Its time is read as epoch
 * milliseconds: the column is a naive UTC timestamp.
 */
async function claimDueComunicado(
  tx: ComunicadosTx,
  tried: readonly number[],
): Promise<Claim | null> {
  const { rows } = await tx.execute<{
    id: number;
    version: number;
    scheduled_at_ms: number;
  }>(sql`
    SELECT id, version,
      floor(extract(epoch FROM scheduled_at) * 1000)::float8 AS scheduled_at_ms
    FROM comunicados
    WHERE status = 'scheduled' AND scheduled_at <= now()
      AND id <> ALL(${intArray(tried)})
    ORDER BY scheduled_at, id
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  `);
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    version: Number(row.version),
    scheduledAt: new Date(Number(row.scheduled_at_ms)),
  };
}

type ReleaseAttempt =
  | { kind: "none" }
  | { kind: "settled"; claim: Claim; result: StartComunicadoSendResult }
  | { kind: "threw"; claim: Claim; error: unknown };

/**
 * One claim and its send, in one transaction (D1), retried once on a
 * deadlock or a profile deletion under the snapshot. A throw after the claim
 * is handed back with it: the transaction has rolled back by then.
 */
async function releaseNext(
  tried: readonly number[],
  onClaimed: ((comunicadoId: number) => Promise<void>) | undefined,
): Promise<ReleaseAttempt> {
  let claimed = null as Claim | null;
  try {
    const settled = await withSendRetry(() =>
      db.transaction(async (tx) => {
        // A retry claims afresh.
        claimed = null;
        const claim = await claimDueComunicado(tx, tried);
        claimed = claim;
        if (!claim) return null;
        await onClaimed?.(claim.id);
        const result = await startComunicadoSend(tx, claim.id, {
          trigger: "schedule",
        });
        return { claim, result };
      }),
    );
    return settled ? { kind: "settled", ...settled } : { kind: "none" };
  } catch (error) {
    // Before any claim nothing points at one comunicado: the step logs it.
    if (!claimed) throw error;
    return { kind: "threw", claim: claimed, error };
  }
}

/**
 * Up to `limit` due schedules, oldest first, while the deadline leaves room.
 * Each claimed comunicado is tried once per run, so one that keeps failing
 * never holds back the next (E2).
 */
export async function releaseDueComunicados({
  deadline,
  now = Date.now,
  limit = COMUNICADO_RELEASES_PER_TICK,
  onClaimed,
  beforeMiss,
}: {
  deadline: number;
  now?: () => number;
  /** Default COMUNICADO_RELEASES_PER_TICK. */
  limit?: number;
  /** Tests: runs while the claimed row is locked, before the send. */
  onClaimed?: (comunicadoId: number) => Promise<void>;
  /**
   * Tests: runs after a refused release rolled back, before the miss is
   * recorded.
   */
  beforeMiss?: (comunicadoId: number) => Promise<void>;
}): Promise<ReleaseRun> {
  const run: ReleaseRun = {
    released: 0,
    missed: 0,
    failed: 0,
    campaignIds: [],
    triedIds: [],
  };

  for (let index = 0; index < limit; index += 1) {
    if (deadline - now() < RELEASE_RESERVE_MS) break;
    const attempt = await releaseNext(run.triedIds, onClaimed);
    if (attempt.kind === "none") break;
    const comunicadoId = attempt.claim.id;
    run.triedIds.push(comunicadoId);

    if (attempt.kind === "settled") {
      const { result } = attempt;
      // The claim holds the row, so it is still due; were it not, it would
      // simply be skipped.
      if (result.kind !== "started") continue;
      run.released += 1;
      run.campaignIds.push(result.campaignId);
      console.log("[comunicados] send", {
        comunicadoId,
        eligible: result.eligible,
        skipped: result.skipped,
        narrowed: result.narrowed,
        trigger: "schedule",
      });
      continue;
    }

    const { error } = attempt;
    const reason =
      error instanceof SendRefusal ? missedReasonOf(error.code) : null;
    if (!(error instanceof SendRefusal) || reason === null) {
      releaseFailed(run, comunicadoId, error);
      continue;
    }
    try {
      await beforeMiss?.(comunicadoId);
      const miss = await recordScheduleMiss({
        comunicadoId,
        version: attempt.claim.version,
        scheduledAt: attempt.claim.scheduledAt,
        refusal: {
          code: error.code,
          message: error.message,
          eligible: error.eligible,
        },
      });
      // A change of date or a send in between won: nothing to record.
      if (!miss.recorded) continue;
      run.missed += 1;
      console.log("[comunicados] release missed", { comunicadoId, reason });
    } catch (failure) {
      releaseFailed(run, comunicadoId, failure);
    }
  }

  return run;
}

/**
 * An unexpected error, or a refusal with no missed reason: the comunicado
 * stays scheduled, and the next tick tries it again until it is late (E4).
 * Type and code only: a query error's message carries its params.
 */
function releaseFailed(run: ReleaseRun, comunicadoId: number, error: unknown) {
  run.failed += 1;
  console.error("[comunicados] release failed", {
    comunicadoId,
    errorType: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
  });
}

/**
 * E4's miss, in a transaction of its own after the release rolled back: the
 * comunicado goes back to draft with its reason and sentence, and the same
 * transaction writes the `comunicado_not_sent` item (G9), so a crash never
 * keeps one without the other. In the app only: no email, no push.
 *
 * The version read under the release's lock is the compare-and-set: a change
 * of date, a cancel or a send that committed in between wins, and nothing is
 * recorded. That also makes D1's one retry safe, for a profile deletion
 * racing the bell item.
 */
export async function recordScheduleMiss({
  comunicadoId,
  version,
  scheduledAt,
  refusal,
}: {
  comunicadoId: number;
  version: number;
  scheduledAt: Date;
  refusal: { code: SendRefusalCode; message: string; eligible: number | null };
}): Promise<{ recorded: boolean; notifiedUserIds: number[] }> {
  const reason = missedReasonOf(refusal.code);
  if (reason === null) {
    throw new Error(`comunicado_refusal_not_a_miss:${refusal.code}`);
  }
  const data: Omit<ComunicadoNotSentData, "title"> = {
    comunicadoId,
    reason,
    detail: missedDetailOf(refusal),
    scheduledAt: scheduledAt.toISOString(),
    audienceCount: refusal.eligible,
  };
  // The bell's body is the draft's banner too; neither shows the title.
  const sentence = comunicadoNotSentBody({ ...data, title: "" });

  return withSendRetry(() =>
    db.transaction(async (tx) => {
      // As "Cancelar programación" does, the confirmation goes: a draft that
      // unticks "Correo esencial" must still save. The scheduler stays.
      const { rows } = await tx.execute<{
        title: string;
        scheduled_by_user_id: number | null;
        missed_ms: string;
      }>(sql`
        UPDATE comunicados
        SET status = 'draft', scheduled_at = NULL, schedule_missed_at = now(),
          schedule_missed_reason = ${reason}::text,
          schedule_missed_detail = ${sentence}::text,
          essential_confirmed_by_user_id = NULL, essential_confirmed_at = NULL,
          version = version + 1, updated_at = now()
        WHERE id = ${comunicadoId}::int AND status = 'scheduled'
          AND version = ${version}::int
        RETURNING title, scheduled_by_user_id,
          floor(extract(epoch FROM schedule_missed_at) * 1000)::bigint AS missed_ms
      `);
      const row = rows[0];
      if (!row) return { recorded: false, notifiedUserIds: [] };

      // Whoever scheduled it while still a global admin, else every one.
      const scheduler =
        row.scheduled_by_user_id == null
          ? null
          : Number(row.scheduled_by_user_id);
      let userIds: number[] = [];
      if (scheduler !== null) {
        const { rows: self } = await tx.execute<{ id: number }>(sql`
          SELECT id FROM users WHERE id = ${scheduler}::int AND role = 'admin'
        `);
        userIds = self.map((admin) => Number(admin.id));
      }
      if (userIds.length === 0) {
        const { rows: admins } = await tx.execute<{ id: number }>(sql`
          SELECT id FROM users WHERE role = 'admin' ORDER BY id
        `);
        userIds = admins.map((admin) => Number(admin.id));
      }

      const notified = await notifyMany(tx, {
        kind: "comunicado_not_sent",
        data: { ...data, title: row.title.trim() || COMUNICADO_UNTITLED },
        userIds,
        dedupeKey: `comunicado-not-sent:${comunicadoId}:${Number(row.missed_ms)}`,
      });
      return { recorded: true, notifiedUserIds: notified.createdUserIds };
    }),
  );
}
