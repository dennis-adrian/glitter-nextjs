import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { ScheduleRefusalCode } from "@/app/lib/comunicados/contracts";
import {
  CANCEL_SENT_MESSAGE,
  RESCHEDULE_NOT_SCHEDULED_MESSAGE,
  RESCHEDULE_SENT_MESSAGE,
  SCHEDULE_DEVELOPMENT_REFUSAL,
  SCHEDULE_STALE_MESSAGE,
} from "@/app/lib/comunicados/schedule-copy";
import { scheduleAtProblem } from "@/app/lib/comunicados/schedule-rules";
import {
  audienceChangedMessage,
  audienceTooLargeMessage,
  checkComunicadoSendable,
  SEND_MESSAGES,
  typedConfirmationRequired,
} from "@/app/lib/comunicados/send";
import { db } from "@/db";
import { comunicados } from "@/db/schema";
import { serverEnv } from "@/env";

/**
 * "Programar", "Cambiar fecha" and "Cancelar programación"
 * (docs/IMPLEMENTATION-comunicados.md E1, E5): each is one compare-and-set
 * that carries the status it expects, so it loses cleanly to the release, to
 * "Enviar ahora" and to the others. Releasing a schedule is `release.ts`'s.
 * Nothing here checks access: the actions do.
 */

export type ScheduleOutcome =
  | { ok: true; version: number; scheduledAt: Date }
  | { ok: false; code: ScheduleRefusalCode; message: string };

function refused(
  code: ScheduleRefusalCode,
  message: string,
): Extract<ScheduleOutcome, { ok: false }> {
  return { ok: false, code, message };
}

/**
 * What every change of time checks first: development never schedules,
 * since no cron would release it and a shared database's own cron would,
 * unnarrowed (E1, K9); then the new time, on this server's clock (E5).
 */
function timeRefusal(at: Date, nowMs: number | undefined) {
  if (serverEnv.VERCEL_ENV === "development") {
    return refused("DEVELOPMENT", SCHEDULE_DEVELOPMENT_REFUSAL);
  }
  const problem = scheduleAtProblem(at, nowMs ?? Date.now());
  return problem ? refused("INVALID_DATE", problem) : null;
}

/**
 * "Programar" (E1): the send's own checks, under the draft's row lock, then
 * the draft becomes scheduled. The content is written as the release will
 * read it, because the CHECKs spare only drafts; an essential one records its
 * confirmation now, since nobody confirms at release (E3). The audience is
 * only counted here: the release resolves it again (B8).
 */
export async function scheduleComunicado(i: {
  comunicadoId: number;
  by: number;
  expectedVersion: number;
  scheduledAt: Date;
  typedCount: number | null;
  nowMs?: number;
}): Promise<ScheduleOutcome> {
  const refusal = timeRefusal(i.scheduledAt, i.nowMs);
  if (refusal) return refusal;
  const env = serverEnv.VERCEL_ENV;

  // Nothing is written before the last statement, so a refusal returned
  // from inside the transaction leaves the draft as it was.
  const outcome = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: comunicados.id,
        status: comunicados.status,
        version: comunicados.version,
        title: comunicados.title,
        doc: comunicados.doc,
        actionLabel: comunicados.actionLabel,
        actionPath: comunicados.actionPath,
        sendEmail: comunicados.sendEmail,
        audience: comunicados.audience,
        essential: comunicados.essential,
        essentialReason: comunicados.essentialReason,
      })
      .from(comunicados)
      .where(eq(comunicados.id, i.comunicadoId))
      .limit(1)
      .for("update");
    if (!row) return refused("NOT_FOUND", SEND_MESSAGES.notFound);
    if (row.status !== "draft" || row.version !== i.expectedVersion) {
      return refused("STALE", SCHEDULE_STALE_MESSAGE);
    }

    const check = await checkComunicadoSendable(tx, row, {
      env,
      narrow: env !== "production",
    });
    if (!check.ok) return refused(check.refusal.code, check.refusal.message);
    // The counts before narrowing, as the send judges them; the snapshot
    // that would refuse these does not run until the release.
    const { content, preview } = check;
    if (preview.tooLarge) {
      return refused("AUDIENCE_TOO_LARGE", audienceTooLargeMessage());
    }
    if (preview.eligible === 0) {
      return refused("NO_ELIGIBLE_RECIPIENTS", SEND_MESSAGES.noEligible);
    }
    if (
      typedConfirmationRequired(preview.eligible, row.essential) &&
      i.typedCount !== preview.eligible
    ) {
      return refused(
        "AUDIENCE_CHANGED",
        audienceChangedMessage(preview.eligible),
      );
    }

    const [scheduled] = await tx
      .update(comunicados)
      .set({
        status: "scheduled",
        scheduledAt: i.scheduledAt,
        scheduledByUserId: i.by,
        // A draft back from a missed schedule is scheduled afresh.
        scheduleMissedAt: null,
        scheduleMissedReason: null,
        scheduleMissedDetail: null,
        title: content.title,
        actionLabel: content.actionLabel,
        actionPath: content.actionPath,
        essentialReason: content.essentialReason,
        essentialConfirmedByUserId: row.essential ? i.by : null,
        essentialConfirmedAt: row.essential ? sql`now()` : null,
        version: sql`${comunicados.version} + 1`,
        updatedAt: sql`now()`,
        updatedByUserId: i.by,
      })
      .where(
        and(
          eq(comunicados.id, row.id),
          eq(comunicados.status, "draft"),
          eq(comunicados.version, i.expectedVersion),
        ),
      )
      .returning({ version: comunicados.version });
    if (!scheduled) return refused("STALE", SCHEDULE_STALE_MESSAGE);
    return {
      ok: true as const,
      version: scheduled.version,
      scheduledAt: i.scheduledAt,
      eligible: preview.eligible,
    };
  });

  if (!outcome.ok) return outcome;
  console.log("[comunicados] schedule", {
    comunicadoId: i.comunicadoId,
    eligible: outcome.eligible,
  });
  return {
    ok: true,
    version: outcome.version,
    scheduledAt: outcome.scheduledAt,
  };
}

/**
 * "Cambiar fecha" (E1): only the time moves, and the admin who scheduled it
 * still sends it (D9). Only the new time is checked, so a schedule about to
 * fall due can still be moved.
 */
export async function rescheduleComunicado(i: {
  comunicadoId: number;
  by: number;
  expectedVersion: number;
  scheduledAt: Date;
  nowMs?: number;
}): Promise<ScheduleOutcome> {
  const refusal = timeRefusal(i.scheduledAt, i.nowMs);
  if (refusal) return refusal;

  const [moved] = await db
    .update(comunicados)
    .set({
      scheduledAt: i.scheduledAt,
      version: sql`${comunicados.version} + 1`,
      updatedAt: sql`now()`,
      updatedByUserId: i.by,
    })
    .where(
      and(
        eq(comunicados.id, i.comunicadoId),
        eq(comunicados.status, "scheduled"),
        eq(comunicados.version, i.expectedVersion),
      ),
    )
    .returning({ version: comunicados.version });
  if (moved) {
    console.log("[comunicados] reschedule", { comunicadoId: i.comunicadoId });
    return { ok: true, version: moved.version, scheduledAt: i.scheduledAt };
  }

  // Why it did not apply, from the row read once afterwards.
  const [stored] = await db
    .select({ status: comunicados.status })
    .from(comunicados)
    .where(eq(comunicados.id, i.comunicadoId))
    .limit(1);
  if (!stored) return refused("NOT_FOUND", SEND_MESSAGES.notFound);
  if (stored.status === "sent") {
    return refused("NOT_SCHEDULED", RESCHEDULE_SENT_MESSAGE);
  }
  if (stored.status === "draft") {
    return refused("NOT_SCHEDULED", RESCHEDULE_NOT_SCHEDULED_MESSAGE);
  }
  return refused("STALE", SCHEDULE_STALE_MESSAGE);
}

/**
 * "Cancelar programación" (E1): back to a draft, without its scheduler or
 * its essential confirmation, which the next "Programar" or "Enviar ahora"
 * records again. Allowed in development, since it is a stop (D10). Not tied
 * to a version: whatever time it had, the admin wants it stopped. A release
 * holding the row makes it wait, and then it reads "sent".
 */
export async function cancelComunicadoSchedule(i: {
  comunicadoId: number;
  by: number;
}): Promise<
  | { ok: true; version: number; alreadyDraft: boolean }
  | { ok: false; code: "NOT_FOUND" | "NOT_SCHEDULED"; message: string }
> {
  const [cancelled] = await db
    .update(comunicados)
    .set({
      status: "draft",
      scheduledAt: null,
      scheduledByUserId: null,
      essentialConfirmedByUserId: null,
      essentialConfirmedAt: null,
      version: sql`${comunicados.version} + 1`,
      updatedAt: sql`now()`,
      updatedByUserId: i.by,
    })
    .where(
      and(
        eq(comunicados.id, i.comunicadoId),
        eq(comunicados.status, "scheduled"),
      ),
    )
    .returning({ version: comunicados.version });
  if (cancelled) {
    console.log("[comunicados] schedule cancelled", {
      comunicadoId: i.comunicadoId,
    });
    return { ok: true, version: cancelled.version, alreadyDraft: false };
  }

  const [stored] = await db
    .select({ status: comunicados.status, version: comunicados.version })
    .from(comunicados)
    .where(eq(comunicados.id, i.comunicadoId))
    .limit(1);
  if (!stored) {
    return { ok: false, code: "NOT_FOUND", message: SEND_MESSAGES.notFound };
  }
  if (stored.status === "sent") {
    return { ok: false, code: "NOT_SCHEDULED", message: CANCEL_SENT_MESSAGE };
  }
  // Cancelled in another tab, or missed at release: what was asked is done.
  return { ok: true, version: stored.version, alreadyDraft: true };
}
