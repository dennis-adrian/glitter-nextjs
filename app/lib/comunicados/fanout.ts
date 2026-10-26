import "server-only";

import { sql } from "drizzle-orm";

import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import {
  COMUNICADO_COMPLETION_SWEEP_LIMIT,
  COMUNICADO_LANE_FANOUT_LIMIT,
  FANOUT_CHUNK,
  FANOUT_MAX_ATTEMPTS,
} from "@/app/lib/comunicados/definitions";
import {
  type ComunicadosTx,
  lockComunicadoShared,
} from "@/app/lib/comunicados/locks";
import { COMUNICADO_SKIP_REASONS } from "@/app/lib/comunicados/skip-reasons";
import { excerptOf } from "@/app/lib/comunicados/text";
import {
  errorCode,
  isTransientDbError,
} from "@/app/lib/notifications/bulk-email";
import { notifyMany } from "@/app/lib/notifications/notify";
import { comunicadoSkipReasonSql } from "@/app/lib/participants/recipient-eligibility-queries";
import { db } from "@/db";
import { serverEnv } from "@/env";

/**
 * Fan-out (docs/IMPLEMENTATION-comunicados.md D2): a sent comunicado's
 * pending recipients become inbox items, with their email and push rows, one
 * chunk of people per transaction; then the campaign completes. Each chunk
 * judges its people again under their locks, so a ban or a deletion request
 * since the send leaves them skipped, and nobody outside the allowlist of
 * sources is ever notified.
 */

/** A chunk starts only with this much of the run left. */
const FANOUT_CHUNK_RESERVE_MS = 5_000;

export type ChunkOutcome =
  | { kind: "done" }
  | { kind: "retracted" }
  | {
      kind: "processed";
      candidateIds: number[];
      notified: number;
      skipped: number;
      /**
       * Not taken: held by another runner, or no longer pending. The caller
       * passes over them for the rest of its run.
       */
      contended: number[];
      pushDeliveryIds: number[];
    };

type Candidate = { id: number; userId: number };

function intArray(ids: readonly number[]) {
  return sql`${sql.param([...ids])}::int[]`;
}

/** Type and SQLSTATE only: a query error's message carries its params. */
function errorShape(error: unknown) {
  return {
    errorType: error instanceof Error ? error.name : typeof error,
    code: errorCode(error),
  };
}

/**
 * What a failed recipient's `last_error` says: the SQLSTATE, our own code
 * (`notification_data_invalid:comunicado`), or the error's name. Never a
 * message that could carry row data.
 */
function failureLabel(error: unknown) {
  const code = errorCode(error);
  if (code) return code.slice(0, 180);
  if (error instanceof Error && /^[a-z_:0-9]+$/.test(error.message)) {
    return error.message.slice(0, 180);
  }
  return (error instanceof Error ? error.name : typeof error).slice(0, 180);
}

/** The next pending people in user order, read without a lock. */
async function chunkCandidates(
  campaignId: number,
  passed: ReadonlySet<number>,
  candidateIds?: readonly number[],
): Promise<Candidate[]> {
  const { rows } = await db.execute<{ id: number; user_id: number }>(
    candidateIds
      ? // Taken as given: the transaction re-reads them pending under a lock,
        // after it has looked for a retraction.
        sql`SELECT id, user_id FROM notification_campaign_recipients
          WHERE campaign_id = ${campaignId}::int
            AND id = ANY(${intArray(candidateIds)})
          ORDER BY user_id`
      : sql`SELECT id, user_id FROM notification_campaign_recipients
          WHERE campaign_id = ${campaignId}::int AND status = 'pending'
            AND id <> ALL(${intArray([...passed])})
          ORDER BY user_id
          LIMIT ${FANOUT_CHUNK}`,
  );
  return rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
  }));
}

/**
 * One chunk in one transaction, in D2's lock order: the comunicado (shared,
 * so an edit or a retraction waits for it), the people, their recipient rows,
 * then the new inbox and delivery rows.
 */
async function writeChunk(
  campaignId: number,
  comunicadoId: number,
  candidates: readonly Candidate[],
): Promise<ChunkOutcome> {
  const startedAt = Date.now();
  // The process's own environment, as the send's narrowing: a comunicado
  // written on one preview and drained by another still reaches only the
  // people picked by name and the admins (B6).
  const narrow = serverEnv.VERCEL_ENV !== "production";

  const outcome = await db.transaction(async (tx): Promise<ChunkOutcome> => {
    await lockComunicadoShared(tx, comunicadoId);
    const { rows: found } = await tx.execute<{
      campaign_id: number | null;
      retracted: boolean;
      send_email: boolean;
      send_push: boolean;
      revision: number | null;
      title: string | null;
      text: string | null;
      action_label: string | null;
      action_path: string | null;
    }>(sql`
      SELECT k.campaign_id, k.retracted_at IS NOT NULL AS retracted,
        k.send_email, k.send_push, rv.revision, rv.title, rv.text,
        rv.action_label, rv.action_path
      FROM comunicados k
      LEFT JOIN comunicado_revisions rv
        ON rv.comunicado_id = k.id AND rv.revision = k.current_revision
      WHERE k.id = ${comunicadoId}::int
    `);
    const content = found[0];
    if (!content || Number(content.campaign_id) !== campaignId) {
      throw new Error("comunicado_not_found");
    }
    // The retraction skipped every pending recipient under the exclusive
    // lock; nothing is left for this chunk to write.
    if (content.retracted) return { kind: "retracted" };
    if (content.revision == null || content.title == null) {
      throw new Error("comunicado_revision_missing");
    }

    // In id order, as the send's snapshot and reservations lock users. A
    // person deleted meanwhile is not returned, and their recipient row has
    // cascaded away; a deletion that comes later waits for this commit.
    const userIds = [...new Set(candidates.map((c) => c.userId))].sort(
      (a, b) => a - b,
    );
    await tx.execute(sql`
      SELECT id FROM users WHERE id = ANY(${intArray(userIds)})
      ORDER BY id FOR KEY SHARE
    `);
    const { rows: lockedRows } = await tx.execute<{ id: number }>(sql`
      SELECT id FROM notification_campaign_recipients
      WHERE id = ANY(${intArray(candidates.map((c) => c.id))})
        AND campaign_id = ${campaignId}::int AND status = 'pending'
      FOR UPDATE SKIP LOCKED
    `);
    const locked = new Set(lockedRows.map((row) => Number(row.id)));
    const contended = candidates
      .map((c) => c.id)
      .filter((id) => !locked.has(id));
    const result = {
      kind: "processed" as const,
      candidateIds: candidates.map((c) => c.id),
      notified: 0,
      skipped: 0,
      contended,
      pushDeliveryIds: [] as number[],
    };
    if (locked.size === 0) return result;

    // B5 rows 1–7 after the locks, in one statement (D2 steps 5 and 6). An
    // allowlist: a row with no source, or whose person is gone, is never
    // notified.
    const person = { id: sql`u.id`, role: sql`u.role`, status: sql`u.status` };
    const { rows: judged } = await tx.execute<{
      id: number;
      user_id: number;
      reason: string | null;
    }>(sql`
      SELECT r.id, r.user_id,
        CASE WHEN u.id IS NULL OR r.source IS NULL
               THEN ${COMUNICADO_SKIP_REASONS.not_participant}::text
             ELSE ${comunicadoSkipReasonSql(person, sql`r.source::text`, narrow)}
        END AS reason
      FROM notification_campaign_recipients r
      LEFT JOIN users u ON u.id = r.user_id
      WHERE r.id = ANY(${intArray([...locked])})
      ORDER BY r.user_id
    `);
    const eligible = judged.filter((row) => row.reason === null);
    const skipped = judged.filter((row) => row.reason !== null);

    const notified: { id: number; notificationId: number }[] = [];
    if (eligible.length > 0) {
      const written = await notifyMany(tx, {
        kind: "comunicado",
        data: {
          comunicadoId,
          revision: Number(content.revision),
          title: content.title,
          excerpt: excerptOf(content.text ?? ""),
          actionPath: content.action_path,
          actionLabel: content.action_label,
        },
        userIds: eligible.map((row) => Number(row.user_id)),
        dedupeKey: `comunicado:${comunicadoId}`,
        campaignId,
        email: content.send_email ? "bulk" : null,
        emailPayload: { comunicadoId },
        push: content.send_push,
      });
      for (const row of eligible) {
        const notificationId = written.notificationIdByUser.get(
          Number(row.user_id),
        );
        // We hold the person's key share: they cannot be missing. Fail the
        // chunk rather than leave the row pending forever.
        if (notificationId === undefined) {
          throw new Error("comunicado_notification_missing");
        }
        notified.push({ id: Number(row.id), notificationId });
      }
      result.pushDeliveryIds = written.pushDeliveryIds;
    }

    if (notified.length > 0) {
      await tx.execute(sql`
        UPDATE notification_campaign_recipients r
        SET status = 'notified', notification_id = v.nid,
          attempts = r.attempts + 1, processed_at = now()
        FROM unnest(${intArray(notified.map((row) => row.id))},
                    ${intArray(notified.map((row) => row.notificationId))})
          AS v(rid, nid)
        WHERE r.id = v.rid AND r.status = 'pending'
      `);
    }
    if (skipped.length > 0) {
      await tx.execute(sql`
        UPDATE notification_campaign_recipients r
        SET status = 'skipped', skipped_reason = v.reason, processed_at = now()
        FROM unnest(${intArray(skipped.map((row) => Number(row.id)))},
                    ${sql.param(skipped.map((row) => row.reason))}::text[])
          AS v(rid, reason)
        WHERE r.id = v.rid AND r.status = 'pending'
      `);
    }
    result.notified = notified.length;
    result.skipped = skipped.length;
    return result;
  });

  if (outcome.kind === "processed") {
    console.log("[comunicados] chunk", {
      campaignId,
      notified: outcome.notified,
      skipped: outcome.skipped,
      ms: Date.now() - startedAt,
    });
  }
  return outcome;
}

/**
 * One chunk of a sent comunicado's pending recipients (D2): the next
 * `FANOUT_CHUNK` people not in `passed`, or exactly `opts.candidateIds`.
 * Throws what the transaction throws; `fanOutComunicado` decides what a
 * failure costs.
 */
export async function processComunicadoChunk(
  campaignId: number,
  comunicadoId: number,
  passed: ReadonlySet<number>,
  opts?: { candidateIds?: readonly number[] },
): Promise<ChunkOutcome> {
  const candidates = await chunkCandidates(
    campaignId,
    passed,
    opts?.candidateIds,
  );
  if (candidates.length === 0) return { kind: "done" };
  return writeChunk(campaignId, comunicadoId, candidates);
}

/**
 * A failed chunk costs each of its still-pending people one attempt, the
 * pattern of gifts' `recordRecipientFailure`: at `FANOUT_MAX_ATTEMPTS` they
 * fail for good. How many did, and who is still pending.
 */
async function recordChunkFailure(
  candidateIds: readonly number[],
  error: unknown,
) {
  const { rows } = await db.execute<{ id: number; status: string }>(sql`
    UPDATE notification_campaign_recipients
    SET attempts = attempts + 1,
      last_error = ${failureLabel(error)}::text,
      status = CASE WHEN attempts + 1 >= ${FANOUT_MAX_ATTEMPTS}::int
                    THEN 'failed'::notification_campaign_recipient_status
                    ELSE status END,
      processed_at = CASE WHEN attempts + 1 >= ${FANOUT_MAX_ATTEMPTS}::int
                          THEN now() ELSE processed_at END
    WHERE id = ANY(${intArray(candidateIds)}) AND status = 'pending'
    RETURNING id, status
  `);
  return {
    failed: rows.filter((row) => row.status === "failed").length,
    pending: new Set(
      rows
        .filter((row) => row.status === "pending")
        .map((row) => Number(row.id)),
    ),
  };
}

function logTransient(campaignId: number, error: unknown) {
  console.warn("[comunicados] chunk rolled back: database error", {
    campaignId,
    ...errorShape(error),
  });
}

export type FanoutRun = {
  chunks: number;
  notified: number;
  skipped: number;
  /** Recipients this run failed for good. */
  failed: number;
  stopped: "done" | "deadline" | "transient" | "retracted";
  pushDeliveryIds: number[];
};

function emptyRun(): FanoutRun {
  return {
    chunks: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    stopped: "done",
    pushDeliveryIds: [],
  };
}

function addChunk(
  run: FanoutRun,
  outcome: Extract<ChunkOutcome, { kind: "processed" }>,
  passed: Set<number>,
) {
  run.chunks += 1;
  run.notified += outcome.notified;
  run.skipped += outcome.skipped;
  run.pushDeliveryIds.push(...outcome.pushDeliveryIds);
  for (const id of outcome.contended) passed.add(id);
}

/**
 * Works through one sent comunicado's pending recipients, chunk by chunk,
 * until none is left or the deadline nears. Safe to run concurrently with
 * another runner (each passes over the rows the other holds) and to resume
 * after a crash, which rolls its chunk back whole.
 *
 * A transient database error spends no attempt: the chunk is tried once more
 * in this run, and a second one leaves the rest for the next run. Any other
 * failure costs its people an attempt and is then retried one person at a
 * time, so a row that keeps failing fails alone.
 */
export async function fanOutComunicado({
  campaignId,
  comunicadoId,
  deadline,
  now = Date.now,
}: {
  campaignId: number;
  comunicadoId: number;
  deadline: number;
  now?: () => number;
}): Promise<FanoutRun> {
  const run = emptyRun();
  const passed = new Set<number>();
  let transientRetried = false;

  for (;;) {
    if (deadline - now() < FANOUT_CHUNK_RESERVE_MS) {
      run.stopped = "deadline";
      return run;
    }
    let candidates: Candidate[] = [];
    let outcome: ChunkOutcome;
    try {
      candidates = await chunkCandidates(campaignId, passed);
      if (candidates.length === 0) return run;
      outcome = await writeChunk(campaignId, comunicadoId, candidates);
    } catch (error) {
      if (isTransientDbError(error)) {
        logTransient(campaignId, error);
        if (transientRetried) {
          run.stopped = "transient";
          return run;
        }
        transientRetried = true;
        continue;
      }
      if (candidates.length === 0) throw error;
      console.error("[comunicados] chunk failed", {
        campaignId,
        size: candidates.length,
        ...errorShape(error),
      });
      const recorded = await recordChunkFailure(
        candidates.map((c) => c.id),
        error,
      );
      run.failed += recorded.failed;

      // One at a time: whoever still fails alone is passed over this run.
      for (const candidate of candidates) {
        if (!recorded.pending.has(candidate.id)) continue;
        if (deadline - now() < FANOUT_CHUNK_RESERVE_MS) {
          run.stopped = "deadline";
          return run;
        }
        try {
          const single = await writeChunk(campaignId, comunicadoId, [
            candidate,
          ]);
          if (single.kind === "retracted") {
            run.stopped = "retracted";
            return run;
          }
          if (single.kind === "processed") addChunk(run, single, passed);
        } catch (singleError) {
          if (isTransientDbError(singleError)) {
            // The rest stay pending, at no cost, for the next run.
            logTransient(campaignId, singleError);
            run.stopped = "transient";
            return run;
          }
          console.error("[comunicados] recipient failed", {
            campaignId,
            recipientId: candidate.id,
            ...errorShape(singleError),
          });
          const alone = await recordChunkFailure([candidate.id], singleError);
          run.failed += alone.failed;
          passed.add(candidate.id);
        }
      }
      continue;
    }

    if (outcome.kind === "retracted") {
      run.stopped = "retracted";
      return run;
    }
    if (outcome.kind === "processed") addChunk(run, outcome, passed);
  }
}

/**
 * The lane's fan-out (D9 step 2): every processing comunicado campaign this
 * environment sent that still has pending recipients, oldest first, at most
 * `limit`. Another environment's campaigns are never touched, so a dev
 * server on a shared database cannot notify anyone for a preview.
 */
export async function fanOutPendingComunicados({
  env,
  deadline,
  limit = COMUNICADO_LANE_FANOUT_LIMIT,
  now = Date.now,
}: {
  env: VercelEnvironment;
  deadline: number;
  limit?: number;
  now?: () => number;
}): Promise<FanoutRun & { campaignIds: number[] }> {
  const { rows } = await db.execute<{
    campaign_id: number;
    comunicado_id: number;
  }>(sql`
    SELECT c.id AS campaign_id, k.id AS comunicado_id
    FROM notification_campaigns c
    JOIN comunicados k ON k.campaign_id = c.id
    WHERE c.type = 'comunicado' AND c.status = 'processing'
      AND k.audience_summary->>'env' = ${env}::text
      AND EXISTS (
        SELECT 1 FROM notification_campaign_recipients r
        WHERE r.campaign_id = c.id AND r.status = 'pending'
      )
    ORDER BY c.created_at, c.id
    LIMIT ${limit}::int
  `);

  const total = { ...emptyRun(), campaignIds: [] as number[] };
  for (const row of rows) {
    if (deadline - now() < FANOUT_CHUNK_RESERVE_MS) {
      total.stopped = "deadline";
      break;
    }
    const campaignId = Number(row.campaign_id);
    const run = await fanOutComunicado({
      campaignId,
      comunicadoId: Number(row.comunicado_id),
      deadline,
      now,
    });
    total.campaignIds.push(campaignId);
    total.chunks += run.chunks;
    total.notified += run.notified;
    total.skipped += run.skipped;
    total.failed += run.failed;
    total.pushDeliveryIds.push(...run.pushDeliveryIds);
    if (run.stopped === "deadline") {
      total.stopped = "deadline";
      break;
    }
    // A transient error or a retraction stops that campaign, not the lane.
    if (run.stopped !== "done" && total.stopped === "done") {
      total.stopped = run.stopped;
    }
  }
  return total;
}

/**
 * Closes a comunicado campaign once nobody is pending and no email is still
 * queued or being sent (D2); pushes are not waited for. Three statements, so
 * the checks run on a fresh snapshot after the row lock: a retry reopening
 * the campaign holds that lock, and its rows are then seen. True when this
 * call closed it.
 */
export async function completeComunicadoIfDone(
  tx: ComunicadosTx,
  campaignId: number,
): Promise<boolean> {
  const { rows: campaigns } = await tx.execute<{
    status: string;
    type: string;
  }>(sql`
    SELECT status, type FROM notification_campaigns
    WHERE id = ${campaignId}::int
    FOR UPDATE
  `);
  const campaign = campaigns[0];
  if (campaign?.type !== "comunicado" || campaign.status !== "processing") {
    return false;
  }

  const { rows: open } = await tx.execute<{ open: boolean }>(sql`
    SELECT EXISTS (
        SELECT 1 FROM notification_campaign_recipients
        WHERE campaign_id = ${campaignId}::int AND status = 'pending'
      )
      OR EXISTS (
        SELECT 1 FROM notification_deliveries d
        JOIN notifications n ON n.id = d.notification_id
        WHERE n.campaign_id = ${campaignId}::int AND d.channel = 'email'
          AND d.status IN ('pending', 'processing')
      ) AS open
  `);
  if (open[0]?.open !== false) return false;

  const { rows: closed } = await tx.execute<{ id: number }>(sql`
    UPDATE notification_campaigns
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE id = ${campaignId}::int AND status = 'processing'
      AND type = 'comunicado'
    RETURNING id
  `);
  return closed.length > 0;
}

/** `completeComunicadoIfDone` in a transaction of its own. */
export async function completeComunicadoCampaign(
  campaignId: number,
): Promise<boolean> {
  return db.transaction((tx) => completeComunicadoIfDone(tx, campaignId));
}

/**
 * The lane tick's sweep (D2, V10): the oldest processing comunicado
 * campaigns, whichever environment sent them, since closing one only checks
 * facts and sends nothing. One failing campaign does not stop the others.
 */
export async function sweepComunicadoCompletions({
  limit = COMUNICADO_COMPLETION_SWEEP_LIMIT,
}: { limit?: number } = {}): Promise<{ checked: number; completed: number }> {
  const { rows } = await db.execute<{ id: number }>(sql`
    SELECT id FROM notification_campaigns
    WHERE status = 'processing' AND type = 'comunicado'
    ORDER BY created_at, id
    LIMIT ${limit}::int
  `);
  let completed = 0;
  for (const row of rows) {
    const campaignId = Number(row.id);
    try {
      if (await completeComunicadoCampaign(campaignId)) completed += 1;
    } catch (error) {
      console.error("[comunicados] completion failed", {
        campaignId,
        ...errorShape(error),
      });
    }
  }
  return { checked: rows.length, completed };
}
