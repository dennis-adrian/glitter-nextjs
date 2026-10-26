import "server-only";

import { eq } from "drizzle-orm";

import type { VercelEnvironment } from "@/app/lib/comunicados/contracts";
import { COMUNICADO_PUSH_STEP_MAX_MS } from "@/app/lib/comunicados/definitions";
import { comunicadoNotificationScope } from "@/app/lib/comunicados/env-scope";
import {
  completeComunicadoCampaign,
  fanOutComunicado,
  fanOutPendingComunicados,
  type FanoutRun,
  sweepComunicadoCompletions,
} from "@/app/lib/comunicados/fanout";
import {
  BULK_BATCH_RESERVE_MS,
  type BulkEmailRun,
  type BulkTiming,
  errorCode,
  expireBulkEmails,
  hasBatchTime,
  sendBulkEmails,
} from "@/app/lib/notifications/bulk-email";
import { sendBulkPushes } from "@/app/lib/notifications/deliveries";
import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";
import { db } from "@/db";
import { comunicados } from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * Who drives the work (docs/IMPLEMENTATION-comunicados.md D9): release,
 * fan-out, bulk push, bulk email and completion, in that order, for one
 * campaign or the whole lane. The send's `after()`, the per-minute cron and
 * "Procesar envíos pendientes" all run it; overlapping runs are safe, since
 * every claim skips what another holds and every close is compare-and-set.
 *
 * Lane-wide, every step takes only the campaigns this environment sent, so a
 * preview or a dev server on a shared database never touches production's.
 * A step that fails is logged and the run goes on to the next one; only
 * completion always runs, whatever the deadline.
 */

export type ComunicadoWorkScope = "lane" | { campaignId: number };
export type ComunicadoWorkTrigger = "send" | "cron" | "button";
export type ComunicadoWorkStep =
  | "release"
  | "fanout"
  | "push"
  | "email"
  | "completion";

export type ComunicadoWorkResult = {
  trigger: ComunicadoWorkTrigger;
  env: VercelEnvironment;
  /** 0 until PR 6 adds the release step. */
  released: number;
  missed: number;
  chunks: number;
  notified: number;
  skipped: number;
  failed: number;
  pushes: {
    scanned: number;
    sent: number;
    skipped: number;
    failed: number;
    retry: number;
  };
  email: BulkEmailRun | null;
  /**
   * Why the email step sent nothing: lane-wide in development, an unusable
   * public base URL, or too little time left for a batch (expiry still ran).
   */
  emailSkipped: "development" | "base_url" | "deadline" | null;
  expired: number;
  completed: number;
  failedSteps: ComunicadoWorkStep[];
  ms: number;
};

/** The comunicado a send's campaign belongs to. */
async function comunicadoIdOf(campaignId: number) {
  const [row] = await db
    .select({ id: comunicados.id })
    .from(comunicados)
    .where(eq(comunicados.campaignId, campaignId))
    .limit(1);
  if (!row) throw new Error("comunicado_not_found");
  return row.id;
}

export async function runComunicadoWork({
  scope,
  deadline,
  trigger,
  now = Date.now,
  emailTiming,
}: {
  scope: ComunicadoWorkScope;
  deadline: number;
  trigger: ComunicadoWorkTrigger;
  /** The clock `deadline` is on; `Date.now` unless a test moves it. */
  now?: () => number;
  /** The lane's waits, for tests. */
  emailTiming?: Partial<BulkTiming>;
}): Promise<ComunicadoWorkResult> {
  const startedAt = now();
  const env = serverEnv.VERCEL_ENV;
  const campaignId = scope === "lane" ? null : scope.campaignId;
  const result: ComunicadoWorkResult = {
    trigger,
    env,
    released: 0,
    missed: 0,
    chunks: 0,
    notified: 0,
    skipped: 0,
    failed: 0,
    pushes: { scanned: 0, sent: 0, skipped: 0, failed: 0, retry: 0 },
    email: null,
    emailSkipped: null,
    expired: 0,
    completed: 0,
    failedSteps: [],
    ms: 0,
  };
  /** Campaigns this run fanned out, to close once the rest is done. */
  const touched = new Set<number>(campaignId == null ? [] : [campaignId]);

  // Type and SQLSTATE only: a query error's message carries its params.
  async function step(name: ComunicadoWorkStep, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      if (!result.failedSteps.includes(name)) result.failedSteps.push(name);
      console.error("[comunicados] work step failed", {
        trigger,
        step: name,
        errorType: error instanceof Error ? error.name : typeof error,
        code: errorCode(error),
      });
    }
  }

  // 1. PR 6 releases due schedules here, lane-wide, and fills
  // `released` and `missed`.

  // 2. Fan-out: each chunk checks the deadline itself.
  await step("fanout", async () => {
    let run: FanoutRun;
    if (campaignId == null) {
      const lane = await fanOutPendingComunicados({ env, deadline, now });
      for (const id of lane.campaignIds) touched.add(id);
      run = lane;
    } else {
      run = await fanOutComunicado({
        campaignId,
        comunicadoId: await comunicadoIdOf(campaignId),
        deadline,
        now,
      });
    }
    result.chunks += run.chunks;
    result.notified += run.notified;
    result.skipped += run.skipped;
    result.failed += run.failed;
  });

  // 3. Bulk push: at most its share of the run, none once time is up.
  const pushBudgetMs = Math.max(
    0,
    Math.min(COMUNICADO_PUSH_STEP_MAX_MS, deadline - now()),
  );
  if (pushBudgetMs > 0) {
    await step("push", async () => {
      result.pushes = await sendBulkPushes(
        campaignId == null
          ? { scope: comunicadoNotificationScope(env), budgetMs: pushBudgetMs }
          : { campaignId, budgetMs: pushBudgetMs },
      );
    });
  }

  // 4. Bulk email (D-9). Lane-wide in development the step does nothing,
  // expiry included: a dev server on a shared database must never mark
  // another environment's mail. A send's own run there is simulated.
  if (campaignId == null && env === "development") {
    result.emailSkipped = "development";
  } else {
    const problem = emailBaseUrlProblem(publicBaseUrl(), env);
    if (problem) {
      // Links in the email would not work: nothing is sent until it is set.
      console.error("[comunicados] email step skipped:", problem);
      result.emailSkipped = "base_url";
    } else {
      const reserveMs = emailTiming?.reserveMs ?? BULK_BATCH_RESERVE_MS;
      await step("email", async () => {
        if (!hasBatchTime(deadline, now(), reserveMs)) {
          // No batch fits, but nothing may wait past its 20 hours.
          result.emailSkipped = "deadline";
          result.expired = await expireBulkEmails();
          return;
        }
        result.email = await sendBulkEmails({
          ...(campaignId == null ? {} : { campaignId }),
          deadline,
          timing: emailTiming,
          now,
        });
        result.expired = result.email.expired;
      });
    }
  }

  // 5. Completion, whatever the deadline: it sends nothing. Lane-wide, the
  // sweep also closes campaigns other runs finished, any environment's (D-8).
  for (const id of touched) {
    await step("completion", async () => {
      if (await completeComunicadoCampaign(id)) result.completed += 1;
    });
  }
  if (campaignId == null) {
    await step("completion", async () => {
      result.completed += (await sweepComunicadoCompletions()).completed;
    });
  }

  result.ms = now() - startedAt;
  console.log("[comunicados] tick", {
    trigger,
    released: result.released,
    missed: result.missed,
    chunks: result.chunks,
    pushes: result.pushes.sent,
    batches: result.email?.batches ?? 0,
    expired: result.expired,
    throttles: result.email?.throttles ?? 0,
    ms: result.ms,
  });
  return result;
}
