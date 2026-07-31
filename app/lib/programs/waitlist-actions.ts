"use server";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  fetchOccurrenceAvailability,
  hasValidTicketFor,
  lockOccurrences,
} from "@/app/lib/programs/inventory-queries";
import { resolveAttendeeIdentity } from "@/app/lib/programs/registration";
import { resolveOccurrenceState } from "@/app/lib/programs/state";
import {
  resolveWaitlistJoin,
  WAITLIST_JOIN_BLOCKER_LABELS,
} from "@/app/lib/programs/waitlist";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSessions,
  programs,
  sessionOccurrences,
  sessionWaitlistEntries,
} from "@/db/schema";

const joinSchema = z.object({
  occurrenceId: z.number().int().positive(),
  /** Required for guests, forbidden for signed-in buyers (server decides). */
  guestName: z.string().trim().min(1).max(200).optional(),
  guestEmail: z.string().trim().email().max(200).optional(),
  guestPhone: z.string().trim().min(1).max(40).optional(),
});

export type JoinWaitlistInput = z.input<typeof joinSchema>;

export type WaitlistActionResult =
  | { success: true; message: string; entryId: number }
  | { success: false; message: string };

/**
 * Adds someone to a sold-out occurrence's waitlist.
 *
 * Joining promises nothing beyond being reachable: there is no position, no
 * queue order, and no automatic promotion. An admin chooses who to invite when
 * a seat is actually released, which is why the entry carries contact details
 * and nothing else.
 *
 * The occurrence is locked first so the availability read cannot race a
 * checkout committing the last seat — otherwise someone could be told "there
 * are seats, buy instead" a moment after the last one went.
 */
export async function joinWaitlist(
  input: JoinWaitlistInput,
): Promise<WaitlistActionResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Revisa los datos del formulario",
    };
  }

  const data = parsed.data;
  const profile = await getCurrentUserProfile();

  const person = resolveAttendeeIdentity(
    profile,
    profile
      ? null
      : data.guestName && data.guestEmail
        ? { name: data.guestName, email: data.guestEmail }
        : null,
  );

  if (!person) {
    return {
      success: false,
      message: "Necesitamos tu nombre y correo para avisarte",
    };
  }

  if (!profile && !data.guestPhone) {
    return { success: false, message: "Necesitamos un teléfono de contacto" };
  }

  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      await lockOccurrences(tx, [data.occurrenceId]);

      const [context] = await tx
        .select({
          occurrence: sessionOccurrences,
          session: programSessions,
          program: programs,
        })
        .from(sessionOccurrences)
        .innerJoin(
          programSessions,
          eq(programSessions.id, sessionOccurrences.sessionId),
        )
        .innerJoin(programs, eq(programs.id, programSessions.programId))
        .where(eq(sessionOccurrences.id, data.occurrenceId))
        .limit(1);

      if (!context) {
        return { kind: "error" as const, message: "Horario no encontrado" };
      }

      const occurrenceState = resolveOccurrenceState(
        {
          programStatus: context.program.status,
          sessionStatus: context.session.status,
          lifecycleStatus: context.occurrence.lifecycleStatus,
          salesStartAt: context.occurrence.salesStartAt,
          salesEndAt: context.occurrence.salesEndAt,
          salesClosedAt: context.occurrence.salesClosedAt,
          rescheduledAt: context.occurrence.rescheduledAt,
        },
        now,
      );

      const [availability, hasExistingTicket, existing] = await Promise.all([
        fetchOccurrenceAvailability(tx, data.occurrenceId, { now }),
        hasValidTicketFor(tx, data.occurrenceId, person),
        tx
          .select({ id: sessionWaitlistEntries.id })
          .from(sessionWaitlistEntries)
          .where(
            and(
              eq(sessionWaitlistEntries.occurrenceId, data.occurrenceId),
              ne(sessionWaitlistEntries.status, "removed"),
              profile
                ? eq(sessionWaitlistEntries.userId, profile.id)
                : // Case-insensitive, matching the partial unique index.
                  sql`lower(${sessionWaitlistEntries.guestEmail}) = lower(${person.email})`,
            ),
          )
          .limit(1),
      ]);

      const check = resolveWaitlistJoin({
        occurrenceState,
        availability,
        hasExistingTicket,
        isAlreadyWaiting: existing.length > 0,
      });

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: WAITLIST_JOIN_BLOCKER_LABELS[check.blocker],
        };
      }

      const [entry] = await tx
        .insert(sessionWaitlistEntries)
        .values({
          occurrenceId: data.occurrenceId,
          userId: profile?.id ?? null,
          guestName: profile ? null : (data.guestName ?? null),
          guestEmail: profile ? null : (data.guestEmail ?? null),
          guestPhone: profile ? null : (data.guestPhone ?? null),
        })
        .returning({ id: sessionWaitlistEntries.id });

      return { kind: "joined" as const, entryId: entry.id };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/programs", "layout");
    revalidatePath("/dashboard/programs", "layout");

    return {
      success: true,
      entryId: outcome.entryId,
      message:
        "Te anotamos en la lista. Si se libera un cupo, te escribimos — no es por orden de llegada.",
    };
  } catch (error) {
    console.error("Waitlist join failed", {
      occurrenceId: data.occurrenceId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos anotarte en la lista. Intenta de nuevo.",
    };
  }
}

const withdrawSchema = z.object({
  occurrenceId: z.number().int().positive(),
});

/**
 * Takes a signed-in person off a waitlist at their own request.
 *
 * Guests are not offered this: identifying them would need the same secure
 * token machinery purchases use, and a waitlist entry carries nothing worth
 * protecting with it. They can ask the team instead.
 */
export async function withdrawFromWaitlist(
  input: z.input<typeof withdrawSchema>,
): Promise<{ success: boolean; message: string }> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const profile = await getCurrentUserProfile();
  if (!profile) return { success: false, message: "No autorizado" };

  const parsed = withdrawSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Datos inválidos" };
  }

  try {
    const removed = await db
      .update(sessionWaitlistEntries)
      .set({ status: "removed", updatedAt: new Date() })
      .where(
        and(
          eq(sessionWaitlistEntries.occurrenceId, parsed.data.occurrenceId),
          eq(sessionWaitlistEntries.userId, profile.id),
          ne(sessionWaitlistEntries.status, "removed"),
        ),
      )
      .returning({ id: sessionWaitlistEntries.id });

    if (removed.length === 0) {
      return { success: false, message: "No estás en esta lista de espera" };
    }

    revalidatePath("/programs", "layout");
    revalidatePath("/dashboard/programs", "layout");

    return { success: true, message: "Te sacamos de la lista de espera" };
  } catch (error) {
    console.error("Waitlist withdrawal failed", {
      occurrenceId: parsed.data.occurrenceId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos completar la acción. Intenta de nuevo.",
    };
  }
}

/** Whether the signed-in viewer is already on this occurrence's list. */
export async function isOnWaitlist(occurrenceId: number): Promise<boolean> {
  const profile = await getCurrentUserProfile();
  if (!profile) return false;

  const rows = await db
    .select({ id: sessionWaitlistEntries.id })
    .from(sessionWaitlistEntries)
    .where(
      and(
        eq(sessionWaitlistEntries.occurrenceId, occurrenceId),
        eq(sessionWaitlistEntries.userId, profile.id),
        ne(sessionWaitlistEntries.status, "removed"),
        isNull(sessionWaitlistEntries.guestEmail),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
