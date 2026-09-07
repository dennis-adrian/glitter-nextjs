"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  normalizeTicketCode,
  resolveCheckIn,
  type CheckInResult,
  type CheckInTicket,
} from "@/app/lib/programs/checkin";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  sessionAttendances,
  sessionOccurrences,
  sessionTickets,
} from "@/db/schema";

/**
 * `success` reports whether the action was allowed to run at all — flag, role,
 * input. The door's verdict is `result.outcome`, which is a legitimate answer
 * even when it turns someone away. Conflating the two would make "entrada
 * cancelada" indistinguishable from "no autorizado".
 */
export type CheckInActionResult =
  | { success: true; result: CheckInResult }
  | { success: false; message: string };

const checkInSchema = z.object({
  occurrenceId: z.number().int().positive(),
  /**
   * Generous ceiling: a camera may hand back a URL wrapping the code, and
   * `normalizeTicketCode` reduces it before the lookup.
   */
  code: z.string().trim().min(1).max(500),
  method: z.enum(["qr_scan", "manual_code"]),
});

/**
 * Records one arrival at one occurrence's door.
 *
 * Deliberately not wrapped in a transaction. The write is a single insert whose
 * unique constraint on `ticketId` *is* the duplicate-scan rule
 * (docs/ARCHITECTURE-paid-programs-and-sessions.md §7.3), so two operators
 * scanning the same ticket at the same instant resolve without locking: one
 * inserts, the other gets zero rows back and reads "ya fue usada".
 *
 * The gap between reading the ticket and inserting is knowingly accepted. A
 * ticket cancelled in that window would be admitted; the alternative is an
 * insert-select that collapses every rejection into "zero rows" and leaves the
 * door with no idea why it said no.
 */
export async function checkInTicket(
  input: z.input<typeof checkInSchema>,
): Promise<CheckInActionResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Código de entrada inválido" };
  }

  const { occurrenceId, method } = parsed.data;
  const code = normalizeTicketCode(parsed.data.code);
  if (!code) {
    return { success: false, message: "Código de entrada inválido" };
  }

  const [target, ticketRow] = await Promise.all([
    db.query.sessionOccurrences.findFirst({
      where: eq(sessionOccurrences.id, occurrenceId),
      columns: { id: true, lifecycleStatus: true },
      with: { session: { columns: { programId: true } } },
    }),
    db.query.sessionTickets.findFirst({
      where: eq(sessionTickets.code, code),
      columns: {
        id: true,
        occurrenceId: true,
        status: true,
        attendeeName: true,
      },
      with: {
        attendance: { columns: { checkedInAt: true } },
        occurrence: {
          columns: { id: true },
          with: { session: { columns: { title: true } } },
        },
      },
    }),
  ]);

  if (!target) {
    return { success: false, message: "Horario no encontrado" };
  }

  const ticket: CheckInTicket | null = ticketRow
    ? {
        ticketId: ticketRow.id,
        occurrenceId: ticketRow.occurrenceId,
        status: ticketRow.status,
        attendeeName: ticketRow.attendeeName,
        sessionTitle: ticketRow.occurrence.session.title,
        checkedInAt: ticketRow.attendance?.checkedInAt ?? null,
      }
    : null;

  const rejection = resolveCheckIn({
    ticket,
    targetOccurrenceId: target.id,
    targetLifecycleStatus: target.lifecycleStatus,
  });
  if (rejection) return { success: true, result: rejection };

  // `resolveCheckIn` returning null guarantees a ticket for this occurrence.
  const admitted = ticket!;
  const now = new Date();

  const [inserted] = await db
    .insert(sessionAttendances)
    .values({
      ticketId: admitted.ticketId,
      occurrenceId: admitted.occurrenceId,
      checkedInAt: now,
      operatorUserId: admin.id,
      method,
    })
    .onConflictDoNothing({ target: sessionAttendances.ticketId })
    .returning({ checkedInAt: sessionAttendances.checkedInAt });

  if (!inserted) {
    /**
     * Lost the race against another door device. Re-read rather than reporting
     * the time this scan would have written — the attendance that exists is the
     * one that happened, and showing a time that is not in the record would
     * make the two devices disagree on screen.
     */
    const existing = await db.query.sessionAttendances.findFirst({
      where: eq(sessionAttendances.ticketId, admitted.ticketId),
      columns: { checkedInAt: true },
    });

    return {
      success: true,
      result: {
        outcome: "already_used",
        attendeeName: admitted.attendeeName,
        checkedInAt: existing?.checkedInAt ?? now,
      },
    };
  }

  /**
   * Only a real check-in invalidates anything, and only the two screens whose
   * numbers moved. Revalidating the whole `/dashboard/programs` layout here
   * would re-render the scanner itself on every successful scan.
   */
  revalidatePath(`/dashboard/programs/occurrences/${occurrenceId}`);
  revalidatePath(`/dashboard/programs/${target.session.programId}/enrollments`);

  return {
    success: true,
    result: {
      outcome: "checked_in",
      attendeeName: admitted.attendeeName,
      checkedInAt: inserted.checkedInAt,
    },
  };
}
