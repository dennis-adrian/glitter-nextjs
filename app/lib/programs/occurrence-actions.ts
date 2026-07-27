"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fetchProgramSettings } from "@/app/lib/programs/data";
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
} from "@/db/schema";

const REASON_MAX = 500;

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
    reason: z.string().trim().min(1).max(REASON_MAX),
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

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return {
      success: false,
      message: "La cancelación requiere un motivo",
    } as const;
  }

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
      cancelledReason: trimmedReason.slice(0, REASON_MAX),
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

  await db
    .delete(sessionOccurrences)
    .where(eq(sessionOccurrences.id, occurrenceId));

  revalidatePrograms();

  return { success: true, message: "Horario eliminado" } as const;
}
