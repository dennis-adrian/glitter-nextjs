"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  comunicadosActor,
  logComunicadosFailure,
} from "@/app/lib/comunicados/actor";
import type { ScheduleActionResult } from "@/app/lib/comunicados/contracts";
import { ComunicadoDraftSchema } from "@/app/lib/comunicados/definitions";
import {
  cancelComunicadoSchedule,
  rescheduleComunicado,
  scheduleComunicado,
  type ScheduleOutcome,
} from "@/app/lib/comunicados/schedule";
import {
  CANCEL_ALREADY_DRAFT_MESSAGE,
  CANCELLED_TOAST,
  rescheduledToast,
  scheduledToast,
} from "@/app/lib/comunicados/schedule-copy";

/*
 * "Programar…", "Cambiar fecha" and "Cancelar programación"
 * (docs/IMPLEMENTATION-comunicados.md E1, E5, G2, G5, G6). The time travels
 * as an ISO instant, so the browser's zone never reaches the server.
 */

const COMUNICADOS_PATH = "/dashboard/communications";

const ComunicadoIdSchema = ComunicadoDraftSchema.shape.comunicadoId;

const RescheduleSchema = z.object({
  comunicadoId: ComunicadoIdSchema,
  /** The version the dialog was opened on. */
  expectedVersion: z.number().int().min(1),
  scheduledAt: z.iso.datetime(),
});

const ScheduleSchema = RescheduleSchema.extend({
  /** What was typed, when the dialog asked for it; the server re-counts. */
  typedCount: z.number().int().min(0).nullable(),
});

const CancelSchema = z.object({ comunicadoId: ComunicadoIdSchema });

const UNREADABLE = "No pudimos leer la programación. Probá de nuevo.";
const SCHEDULE_FAILED =
  "No pudimos programarlo. Intentá de nuevo en unos minutos.";
const CANCEL_FAILED = "No pudimos cancelar la programación. Probá de nuevo.";

const unreadable: ScheduleActionResult = {
  success: false,
  code: "INVALID",
  message: UNREADABLE,
};

function revalidateComunicado(comunicadoId: number) {
  revalidatePath(COMUNICADOS_PATH);
  revalidatePath(`${COMUNICADOS_PATH}/${comunicadoId}`);
}

/** A schedule or a change of time, answered with its toast or its refusal. */
async function answer(
  comunicadoId: number,
  log: string,
  change: () => Promise<ScheduleOutcome>,
  toast: (at: Date) => string,
): Promise<ScheduleActionResult> {
  let outcome: ScheduleOutcome;
  try {
    outcome = await change();
  } catch (error) {
    logComunicadosFailure(log, error);
    return { success: false, code: "FAILED", message: SCHEDULE_FAILED };
  }
  if (!outcome.ok) {
    return { success: false, code: outcome.code, message: outcome.message };
  }
  revalidateComunicado(comunicadoId);
  return { success: true, message: toast(outcome.scheduledAt) };
}

/** "Programar para …" (E1, G5): from a draft, at the version the dialog showed. */
export async function scheduleComunicadoAction(
  input: unknown,
): Promise<ScheduleActionResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = ScheduleSchema.safeParse(input);
  if (!parsed.success) return unreadable;

  const { comunicadoId, expectedVersion, scheduledAt, typedCount } =
    parsed.data;
  return answer(
    comunicadoId,
    "[comunicados] schedule failed",
    () =>
      scheduleComunicado({
        comunicadoId,
        by: actor.id,
        expectedVersion,
        scheduledAt: new Date(scheduledAt),
        typedCount,
      }),
    scheduledToast,
  );
}

/** "Cambiar fecha" (E1, G6): a scheduled one, at the version the page showed. */
export async function rescheduleComunicadoAction(
  input: unknown,
): Promise<ScheduleActionResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = RescheduleSchema.safeParse(input);
  if (!parsed.success) return unreadable;

  const { comunicadoId, expectedVersion, scheduledAt } = parsed.data;
  return answer(
    comunicadoId,
    "[comunicados] reschedule failed",
    () =>
      rescheduleComunicado({
        comunicadoId,
        by: actor.id,
        expectedVersion,
        scheduledAt: new Date(scheduledAt),
      }),
    rescheduledToast,
  );
}

/**
 * "Cancelar programación" (E1, G6). One already back to a draft answers
 * success: what the admin asked for is already so (§J implementation
 * notes).
 */
export async function cancelComunicadoScheduleAction(
  input: unknown,
): Promise<ScheduleActionResult> {
  const { actor, blocked } = await comunicadosActor();
  if (blocked) return { ...blocked, code: "FORBIDDEN" };
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success) return unreadable;

  const { comunicadoId } = parsed.data;
  try {
    const outcome = await cancelComunicadoSchedule({
      comunicadoId,
      by: actor.id,
    });
    if (!outcome.ok) {
      return { success: false, code: outcome.code, message: outcome.message };
    }
    revalidateComunicado(comunicadoId);
    return {
      success: true,
      message: outcome.alreadyDraft
        ? CANCEL_ALREADY_DRAFT_MESSAGE
        : CANCELLED_TOAST,
    };
  } catch (error) {
    logComunicadosFailure("[comunicados] cancel schedule failed", error);
    return { success: false, code: "FAILED", message: CANCEL_FAILED };
  }
}
