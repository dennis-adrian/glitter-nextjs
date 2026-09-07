"use server";

import { and, eq, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { sendWaitlistInvitationEmail } from "@/app/lib/programs/notifications";
import {
  generateAccessToken,
  hashAccessToken,
} from "@/app/lib/programs/tokens";
import { resolveInvitationWindowMinutes } from "@/app/lib/programs/waitlist";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSettings,
  programSessions,
  programs,
  sessionOccurrences,
  sessionWaitlistEntries,
  sessionWaitlistInvitations,
  users,
} from "@/db/schema";

const inviteSchema = z.object({
  entryId: z.number().int().positive(),
  /** PRD §14: every sensitive admin action records why. */
  reason: z.string().trim().min(3).max(500),
});

export type WaitlistAdminResult =
  | { success: true; message: string }
  | { success: false; message: string };

/** Contact details for whichever branch of the identity check is populated. */
async function resolveEntryContact(
  executor: typeof db,
  entry: {
    userId: number | null;
    guestName: string | null;
    guestEmail: string | null;
  },
): Promise<{ name: string; email: string } | null> {
  if (entry.userId === null) {
    return entry.guestEmail
      ? { name: entry.guestName ?? entry.guestEmail, email: entry.guestEmail }
      : null;
  }

  const [user] = await executor
    .select({
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, entry.userId))
    .limit(1);

  if (!user) return null;

  const fullName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name: user.displayName?.trim() || fullName || user.email,
    email: user.email,
  };
}

/**
 * Invites one waitlisted person to buy a released seat.
 *
 * Never automatic. The PRD and roadmap both require a human to choose, which is
 * why there is no "invite next" — the admin picks a row and says why, and that
 * reason is the audit record.
 *
 * The invitation is what lets checkout past a sold-out occurrence, so it must
 * only be issued after a seat has actually been released. Nothing here checks
 * that: an admin looking at the occurrence dashboard can see the count, and
 * inviting into a full session simply produces an invitation whose checkout
 * still finds no room.
 */
export async function inviteFromWaitlist(
  input: z.input<typeof inviteSchema>,
): Promise<WaitlistAdminResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Escribe el motivo de la invitación" };
  }

  const data = parsed.data;
  const now = new Date();
  // Minted outside the transaction so a rollback never leaves a token that was
  // already handed out.
  const token = generateAccessToken();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [entry] = await tx
        .select()
        .from(sessionWaitlistEntries)
        .where(eq(sessionWaitlistEntries.id, data.entryId))
        .for("update")
        .limit(1);

      if (!entry) {
        return { kind: "error" as const, message: "Registro no encontrado" };
      }

      if (entry.status === "removed" || entry.status === "converted") {
        return {
          kind: "error" as const,
          message: "Este registro ya no está en la lista",
        };
      }

      const [context] = await tx
        .select({
          sessionTitle: programSessions.title,
          startsAt: sessionOccurrences.startsAt,
          endsAt: sessionOccurrences.endsAt,
          programWindow: programs.waitlistInvitationWindowMinutes,
        })
        .from(sessionOccurrences)
        .innerJoin(
          programSessions,
          eq(programSessions.id, sessionOccurrences.sessionId),
        )
        .innerJoin(programs, eq(programs.id, programSessions.programId))
        .where(eq(sessionOccurrences.id, entry.occurrenceId))
        .limit(1);

      if (!context) {
        return { kind: "error" as const, message: "Horario no encontrado" };
      }

      const [settings] = await tx
        .select()
        .from(programSettings)
        .where(eq(programSettings.key, "global"))
        .limit(1);

      if (!settings) {
        return {
          kind: "error" as const,
          message: "Falta la configuración de programas",
        };
      }

      const windowMinutes = resolveInvitationWindowMinutes(
        { waitlistInvitationWindowMinutes: context.programWindow },
        settings,
      );
      const expiresAt = new Date(now.getTime() + windowMinutes * 60_000);

      // Any live invitation is superseded: the partial unique index allows one
      // `sent` row per entry, so re-inviting has to close the previous one.
      await tx
        .update(sessionWaitlistInvitations)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(sessionWaitlistInvitations.waitlistEntryId, entry.id),
            eq(sessionWaitlistInvitations.status, "sent"),
          ),
        );

      await tx.insert(sessionWaitlistInvitations).values({
        waitlistEntryId: entry.id,
        tokenHash: hashAccessToken(token),
        expiresAt,
        invitedByUserId: admin.id,
        reason: data.reason,
      });

      await tx
        .update(sessionWaitlistEntries)
        .set({ status: "invited", updatedAt: now })
        .where(eq(sessionWaitlistEntries.id, entry.id));

      const contact = await resolveEntryContact(
        tx as unknown as typeof db,
        entry,
      );

      return {
        kind: "invited" as const,
        contact,
        occurrenceId: entry.occurrenceId,
        sessionTitle: context.sessionTitle,
        startsAt: context.startsAt,
        endsAt: context.endsAt,
        expiresAt,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath("/programs", "layout");

    if (!outcome.contact) {
      return {
        success: false,
        message:
          "Creamos la invitación pero no encontramos a quién escribirle. Contáctale directamente.",
      };
    }

    /**
     * The sender never throws — it swallows and reports a boolean — so this is
     * read rather than wrapped in a try. It already logs the cause; repeating
     * that here would only duplicate it.
     */
    const delivered = await sendWaitlistInvitationEmail({
      entryId: data.entryId,
      occurrenceId: outcome.occurrenceId,
      buyerName: outcome.contact.name,
      buyerEmail: outcome.contact.email,
      sessionTitle: outcome.sessionTitle,
      startsAt: outcome.startsAt,
      endsAt: outcome.endsAt,
      expiresAt: outcome.expiresAt,
      token,
    });

    /**
     * A failed send is reported as a failure, because nobody was told about the
     * seat and the admin has to act. The invitation itself is committed and the
     * previous one already revoked, so the message says so — re-inviting works
     * but mints a fresh link, invalidating the one that was just generated.
     */
    if (!delivered) {
      return {
        success: false,
        message:
          "Creamos la invitación pero no pudimos enviar el correo. Escríbele directamente, o vuelve a invitar para generar un enlace nuevo.",
      };
    }

    return { success: true, message: "Invitación enviada" };
  } catch (error) {
    console.error("Waitlist invitation failed", {
      entryId: data.entryId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos enviar la invitación. Intenta de nuevo.",
    };
  }
}

const entryActionSchema = z.object({
  entryId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

/** Takes someone off the list, closing any live invitation with it. */
export async function removeFromWaitlist(
  input: z.input<typeof entryActionSchema>,
): Promise<WaitlistAdminResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = entryActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Escribe el motivo" };
  }

  const { entryId, reason } = parsed.data;
  const now = new Date();

  try {
    const done = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(sessionWaitlistEntries)
        .set({
          status: "removed",
          /**
           * Appended, not replaced: `notes` is the admin's context on this
           * person, and overwriting it to record a removal would destroy the
           * reason they were noteworthy in the first place.
           */
          notes: sql`coalesce(${sessionWaitlistEntries.notes} || E'\n', '') || ${reason}`,
          updatedAt: now,
        })
        .where(
          and(
            eq(sessionWaitlistEntries.id, entryId),
            // Both terminal states are excluded. `converted` means they bought
            // the seat — removing them afterwards would misreport a buyer as
            // someone who left the list.
            notInArray(sessionWaitlistEntries.status, ["removed", "converted"]),
          ),
        )
        .returning({ id: sessionWaitlistEntries.id });

      if (!updated) return false;

      // An invitation must not outlive the entry it belongs to.
      await tx
        .update(sessionWaitlistInvitations)
        .set({ status: "revoked", revokedAt: now, updatedAt: now })
        .where(
          and(
            eq(sessionWaitlistInvitations.waitlistEntryId, entryId),
            eq(sessionWaitlistInvitations.status, "sent"),
          ),
        );

      return true;
    });

    if (!done) {
      return {
        success: false,
        message: "Este registro ya salió de la lista o ya compró su cupo",
      };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath("/programs", "layout");

    return { success: true, message: "Registro retirado de la lista" };
  } catch (error) {
    console.error("Waitlist removal failed", {
      entryId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos completar la acción. Intenta de nuevo.",
    };
  }
}
