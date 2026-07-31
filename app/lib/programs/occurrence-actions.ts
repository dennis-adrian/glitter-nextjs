"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchProgramSettings } from "@/app/lib/programs/data";
import { fetchOccurrenceAvailability } from "@/app/lib/programs/inventory-queries";
import { OCCURRENCE_REASON_MAX } from "@/app/lib/programs/definitions";
import {
  canCancelOccurrence,
  canCompleteOccurrence,
  canRescheduleOccurrence,
} from "@/app/lib/programs/state";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  sessionOccurrenceScheduleChanges,
  sessionOccurrences,
  sessionPurchaseLines,
} from "@/db/schema";

/** Cancellation takes its reason as a bare argument, so it validates it alone. */
const reasonSchema = z
  .string()
  .trim()
  .min(1, "La cancelación requiere un motivo")
  .max(
    OCCURRENCE_REASON_MAX,
    `El motivo no puede superar los ${OCCURRENCE_REASON_MAX} caracteres`,
  );

const occurrenceSchema = z
  .object({
    sessionId: z.number().int().positive(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    venueId: z.number().int().positive().nullish(),
    room: z.string().trim().max(120).nullish(),
    capacity: z.number().int().positive().optional(),
    salesStartAt: z.coerce.date().nullish(),
    salesEndAt: z.coerce.date().nullish(),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endsAt"],
  })
  .refine(
    (data) =>
      !data.salesStartAt ||
      !data.salesEndAt ||
      data.salesEndAt >= data.salesStartAt,
    {
      message: "El cierre de ventas no puede ser anterior a la apertura",
      path: ["salesEndAt"],
    },
  );

const rescheduleSchema = z
  .object({
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    venueId: z.number().int().positive().nullish(),
    room: z.string().trim().max(120).nullish(),
    reason: z
      .string()
      .trim()
      .min(1, "El motivo es obligatorio")
      .max(
        OCCURRENCE_REASON_MAX,
        `El motivo no puede superar los ${OCCURRENCE_REASON_MAX} caracteres`,
      ),
  })
  .refine((data) => data.endsAt > data.startsAt, {
    message: "La hora de fin debe ser posterior a la de inicio",
    path: ["endsAt"],
  });

export type OccurrenceInput = z.input<typeof occurrenceSchema>;
export type RescheduleInput = z.input<typeof rescheduleSchema>;

function blankToNull(value: string | null | undefined): string | null {
  return value?.trim() || null;
}

function revalidatePrograms() {
  revalidatePath("/dashboard/programs", "layout");
  revalidatePath("/programs", "layout");
}

export async function createOccurrence(input: OccurrenceInput) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = occurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    } as const;
  }

  const data = parsed.data;
  const settings = await fetchProgramSettings();

  const [occurrence] = await db
    .insert(sessionOccurrences)
    .values({
      sessionId: data.sessionId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      venueId: data.venueId ?? null,
      room: blankToNull(data.room),
      capacity: data.capacity ?? settings.defaultOccurrenceCapacity,
      salesStartAt: data.salesStartAt ?? null,
      salesEndAt: data.salesEndAt ?? null,
    })
    .returning();

  revalidatePrograms();

  return {
    success: true,
    message: "Horario agregado",
    occurrenceId: occurrence.id,
  } as const;
}

/**
 * Full in-place edit of a scheduled occurrence, including its times. This is
 * for correcting data that nobody has acted on yet.
 *
 * Changing `startsAt`/`endsAt` is refused once the occurrence has sold seats:
 * that goes through `rescheduleOccurrence`, which demands a reason, writes an
 * immutable history row, and gives ticket holders the right to request a
 * refund. Everything else on this form stays editable either way.
 */
export async function updateOccurrence(
  occurrenceId: number,
  input: OccurrenceInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = occurrenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    } as const;
  }

  const data = parsed.data;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    columns: {
      lifecycleStatus: true,
      sessionId: true,
      startsAt: true,
      endsAt: true,
    },
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  // An occurrence belongs to the session it was created under. The input still
  // carries `sessionId` because it is the same payload `createOccurrence` takes,
  // so a mismatch is a caller bug, not a request to move the occurrence.
  if (existing.sessionId !== data.sessionId) {
    return { success: false, message: "Datos inválidos" } as const;
  }

  if (existing.lifecycleStatus !== "scheduled") {
    return {
      success: false,
      message: "Un horario cancelado o finalizado no se puede editar",
    } as const;
  }

  /**
   * Anyone holding or having bought a seat was told a time. Moving it silently
   * from this form would leave them with a ticket for a session that no longer
   * happens then, and no record of the change — `rescheduleOccurrence` exists
   * to do it properly. Only a genuine time change is blocked; every other field
   * stays editable.
   */
  const movesSchedule =
    data.startsAt.getTime() !== existing.startsAt.getTime() ||
    data.endsAt.getTime() !== existing.endsAt.getTime();

  if (movesSchedule || data.capacity !== undefined) {
    const availability = await fetchOccurrenceAvailability(db, occurrenceId);

    if (movesSchedule && availability.occupied > 0) {
      return {
        success: false,
        message:
          "Este horario ya tiene inscripciones. Usa Reprogramar para cambiar la fecha.",
      } as const;
    }

    /**
     * Capacity is editable while the schedule stands, but not below what is
     * already taken — that would oversell the occurrence against seats real
     * people are holding, and every availability read afterwards would report
     * a negative remainder.
     */
    if (data.capacity !== undefined && data.capacity < availability.occupied) {
      return {
        success: false,
        message: `Ya hay ${availability.occupied} cupo(s) ocupado(s); no puedes bajar el total por debajo de eso.`,
      } as const;
    }
  }

  await db
    .update(sessionOccurrences)
    .set({
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      venueId: data.venueId ?? null,
      room: blankToNull(data.room),
      ...(data.capacity === undefined ? {} : { capacity: data.capacity }),
      salesStartAt: data.salesStartAt ?? null,
      salesEndAt: data.salesEndAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return { success: true, message: "Horario actualizado" } as const;
}

/**
 * Closes sales manually, independent of the configured window. Setting and
 * clearing are separate concerns from the window so an admin can stop sales
 * without editing dates.
 */
export async function setOccurrenceSalesClosed(
  occurrenceId: number,
  closed: boolean,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    columns: { lifecycleStatus: true },
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  if (existing.lifecycleStatus !== "scheduled") {
    return {
      success: false,
      message: "Un horario cancelado o finalizado no se puede editar",
    } as const;
  }

  await db
    .update(sessionOccurrences)
    .set({ salesClosedAt: closed ? new Date() : null, updatedAt: new Date() })
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return {
    success: true,
    message: closed ? "Ventas cerradas" : "Ventas reabiertas",
  } as const;
}

export async function cancelOccurrence(occurrenceId: number, reason: string) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return {
      success: false,
      message:
        parsedReason.error.issues[0]?.message ??
        "La cancelación requiere un motivo",
    } as const;
  }

  const trimmedReason = parsedReason.data;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    columns: { lifecycleStatus: true },
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  if (!canCancelOccurrence(existing.lifecycleStatus)) {
    return {
      success: false,
      message: "Solo se puede cancelar un horario programado",
    } as const;
  }

  const now = new Date();

  await db
    .update(sessionOccurrences)
    .set({
      lifecycleStatus: "cancelled",
      cancelledAt: now,
      cancelledReason: trimmedReason,
      updatedAt: now,
    })
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return { success: true, message: "Horario cancelado" } as const;
}

export async function completeOccurrence(occurrenceId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    columns: { lifecycleStatus: true, endsAt: true },
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  if (!canCompleteOccurrence(existing.endsAt, existing.lifecycleStatus)) {
    return {
      success: false,
      message: "Solo se puede finalizar un horario programado que ya terminó",
    } as const;
  }

  const now = new Date();

  await db
    .update(sessionOccurrences)
    .set({ lifecycleStatus: "completed", completedAt: now, updatedAt: now })
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return { success: true, message: "Horario finalizado" } as const;
}

/**
 * Moves an occurrence in place and appends an immutable history row. The
 * occurrence keeps its id, so tickets pointing at it stay valid with no
 * mutation — the resolution of PRD open note §17.4.
 */
export async function rescheduleOccurrence(
  occurrenceId: number,
  input: RescheduleInput,
) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "Datos inválidos",
    } as const;
  }

  const data = parsed.data;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  if (!canRescheduleOccurrence(existing.lifecycleStatus)) {
    return {
      success: false,
      message: "Un horario cancelado o finalizado no se puede reprogramar",
    } as const;
  }

  const now = new Date();
  const toVenueId = data.venueId ?? null;
  const toRoom = blankToNull(data.room);

  await db.transaction(async (tx) => {
    await tx.insert(sessionOccurrenceScheduleChanges).values({
      occurrenceId,
      fromStartsAt: existing.startsAt,
      fromEndsAt: existing.endsAt,
      toStartsAt: data.startsAt,
      toEndsAt: data.endsAt,
      fromVenueId: existing.venueId,
      toVenueId,
      fromRoom: existing.room,
      toRoom,
      reason: data.reason,
      actorUserId: profile.id,
    });

    await tx
      .update(sessionOccurrences)
      .set({
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        venueId: toVenueId,
        room: toRoom,
        rescheduledAt: now,
        updatedAt: now,
      })
      .where(eq(sessionOccurrences.id, occurrenceId));
  });

  revalidatePrograms();

  return { success: true, message: "Horario reprogramado" } as const;
}

export async function deleteOccurrence(occurrenceId: number) {
  const profile = await requireAdminOrFestivalAdmin();
  if (!profile) return { success: false, message: "No autorizado" } as const;

  const existing = await db.query.sessionOccurrences.findFirst({
    where: eq(sessionOccurrences.id, occurrenceId),
    columns: { lifecycleStatus: true },
  });

  if (!existing) {
    return { success: false, message: "Horario no encontrado" } as const;
  }

  // Deletion is only for scheduling mistakes made before anything was sold.
  // Once an occurrence has run or been cancelled it is history and stays put.
  if (existing.lifecycleStatus !== "scheduled") {
    return {
      success: false,
      message: "Un horario cancelado o finalizado no se puede eliminar",
    } as const;
  }

  /**
   * The composite foreign key on `session_purchase_lines` is `ON DELETE
   * RESTRICT`, so the database already refuses this — but as an opaque driver
   * error. Checking here turns it into an instruction: a sold occurrence is
   * cancelled, not deleted, so its history and its buyers survive.
   */
  const [sold] = await db
    .select({ id: sessionPurchaseLines.id })
    .from(sessionPurchaseLines)
    .where(eq(sessionPurchaseLines.occurrenceId, occurrenceId))
    .limit(1);

  if (sold) {
    return {
      success: false,
      message:
        "Este horario ya tiene inscripciones. Usa Cancelar en lugar de eliminar.",
    } as const;
  }

  await db
    .delete(sessionOccurrences)
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return { success: true, message: "Horario eliminado" } as const;
}
