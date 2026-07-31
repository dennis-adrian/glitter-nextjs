"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  buildSecureLinkUrl,
  sendPaymentApprovedEmail,
  sendPurchaseLinkEmail,
} from "@/app/lib/programs/notifications";
import {
  canCancelAsAdmin,
  canResend,
  SUPPORT_BLOCKER_LABELS,
} from "@/app/lib/programs/support";
import {
  generateAccessToken,
  hashAccessToken,
} from "@/app/lib/programs/tokens";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSessions,
  programs,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchases,
  sessionTickets,
  users,
  venues,
} from "@/db/schema";

const purchaseActionSchema = z.object({
  purchaseId: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
});

export type SupportActionInput = z.input<typeof purchaseActionSchema>;

export type SupportActionResult =
  | { success: true; message: string }
  | { success: false; message: string };

/** Guest details live on the purchase; a signed-in buyer's on their profile. */
async function resolveBuyerContact(
  executor: typeof db,
  purchase: {
    userId: number | null;
    guestName: string | null;
    guestEmail: string | null;
  },
): Promise<{ name: string; email: string | null }> {
  if (purchase.userId === null) {
    return { name: purchase.guestName ?? "", email: purchase.guestEmail };
  }

  const [buyer] = await executor
    .select({
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, purchase.userId))
    .limit(1);

  if (!buyer) return { name: "", email: null };

  const fullName = [buyer.firstName, buyer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    name: buyer.displayName?.trim() || fullName || buyer.email,
    email: buyer.email,
  };
}

/**
 * Cancels a purchase on the buyer's behalf and releases the seat.
 *
 * Cancelling an `approved` purchase is allowed and cancels its tickets with it
 * — that is the support case this exists for. Ticket cancellation is what
 * actually frees an approved seat, since `isHoldingSeat` counts approved
 * purchases through their tickets rather than a hold.
 *
 * No refund is issued or implied here. Refund handling is Phase 5; this only
 * records that the team cancelled and why.
 */
export async function cancelPurchaseAsAdmin(
  input: SupportActionInput,
): Promise<SupportActionResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = purchaseActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Escribe el motivo de la cancelación" };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(sessionPurchases)
        .where(eq(sessionPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const check = canCancelAsAdmin(purchase);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: SUPPORT_BLOCKER_LABELS[check.blocker],
        };
      }

      await tx
        .update(sessionPurchases)
        .set({ status: "cancelled", cancelledAt: now, updatedAt: now })
        .where(eq(sessionPurchases.id, purchase.id));

      const lines = await tx
        .select({ id: sessionPurchaseLines.id })
        .from(sessionPurchaseLines)
        .where(eq(sessionPurchaseLines.purchaseId, purchase.id));

      let ticketsCancelled = 0;

      for (const line of lines) {
        const cancelled = await tx
          .update(sessionTickets)
          .set({
            status: "cancelled",
            cancelledAt: now,
            cancelledReason: data.reason,
            cancelledByActorType: "admin",
            updatedAt: now,
          })
          .where(
            and(
              eq(sessionTickets.purchaseLineId, line.id),
              // Only valid tickets: re-running must not restamp a cancellation.
              eq(sessionTickets.status, "valid"),
            ),
          )
          .returning({ id: sessionTickets.id });

        for (const ticket of cancelled) {
          ticketsCancelled += 1;
          await tx.insert(sessionPurchaseEvents).values({
            purchaseId: purchase.id,
            actorType: "admin",
            actorUserId: admin.id,
            eventType: "ticket_cancelled",
            reason: data.reason,
            changes: { ticketId: ticket.id },
          });
        }
      }

      await tx.insert(sessionPurchaseEvents).values({
        purchaseId: purchase.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: "cancelled_by_admin",
        fromStatus: purchase.status,
        toStatus: "cancelled",
        reason: data.reason,
        changes: { ticketsCancelled },
      });

      return { kind: "done" as const, ticketsCancelled };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath(`/programs/purchases/${data.purchaseId}`);

    return {
      success: true,
      message:
        outcome.ticketsCancelled > 0
          ? `Compra cancelada y ${outcome.ticketsCancelled} entrada(s) anuladas`
          : "Compra cancelada y cupo liberado",
    };
  } catch (error) {
    console.error("Admin purchase cancellation failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos cancelar la compra. Intenta de nuevo.",
    };
  }
}

/**
 * Issues a fresh secure link and emails it to the buyer.
 *
 * **This rotates the token.** The stored value is a digest, so the old link
 * cannot be recovered to re-send — the only way to give a buyer a working link
 * is to mint a new one, which necessarily invalidates the previous one. That is
 * the right trade for an explicitly requested support action: the admin knows
 * they are issuing a replacement, and it is what unblocks a guest who lost the
 * email and has no other route back to their purchase.
 *
 * Approved purchases also get their QR re-sent, since the ticket is the thing
 * they actually need at the door.
 */
export async function resendPurchaseLink(
  input: SupportActionInput,
): Promise<SupportActionResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = purchaseActionSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Escribe el motivo del reenvío" };
  }

  const data = parsed.data;
  const now = new Date();
  // Minted outside the transaction so a rollback never leaves a token that was
  // already handed out.
  const accessToken = generateAccessToken();

  try {
    const outcome = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .select()
        .from(sessionPurchases)
        .where(eq(sessionPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const contact = await resolveBuyerContact(tx as unknown as typeof db, {
        userId: purchase.userId,
        guestName: purchase.guestName,
        guestEmail: purchase.guestEmail,
      });

      const check = canResend(contact.email !== null);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: SUPPORT_BLOCKER_LABELS[check.blocker],
        };
      }

      await tx
        .update(sessionPurchases)
        .set({
          accessTokenHash: hashAccessToken(accessToken),
          // A rotation also un-revokes: the point is to restore access.
          accessTokenRevokedAt: null,
          updatedAt: now,
        })
        .where(eq(sessionPurchases.id, purchase.id));

      await tx.insert(sessionPurchaseEvents).values({
        purchaseId: purchase.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: "link_resent",
        reason: data.reason,
        changes: { rotatedToken: true },
      });

      const lines = await tx
        .select({
          sessionTitle: sessionPurchaseLines.sessionTitleSnapshot,
          sessionType: programSessions.type,
          startsAt: sessionOccurrences.startsAt,
          endsAt: sessionOccurrences.endsAt,
          room: sessionOccurrences.room,
          venueName: venues.name,
          programName: programs.name,
          ticketCode: sessionTickets.code,
          ticketStatus: sessionTickets.status,
        })
        .from(sessionPurchaseLines)
        .innerJoin(
          programSessions,
          eq(programSessions.id, sessionPurchaseLines.sessionId),
        )
        .innerJoin(
          sessionOccurrences,
          eq(sessionOccurrences.id, sessionPurchaseLines.occurrenceId),
        )
        .innerJoin(programs, eq(programs.id, purchase.programId))
        .leftJoin(venues, eq(venues.id, sessionOccurrences.venueId))
        .leftJoin(
          sessionTickets,
          eq(sessionTickets.purchaseLineId, sessionPurchaseLines.id),
        )
        .where(eq(sessionPurchaseLines.purchaseId, purchase.id));

      return {
        kind: "done" as const,
        purchase,
        contact,
        lines,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath(`/programs/purchases/${data.purchaseId}`);

    // Isolated from the outer catch: the token is already rotated, so a mail
    // failure must not read as "nothing happened" — the old link is dead
    // either way, and a retry would rotate again.
    try {
      const secureLinkUrl = buildSecureLinkUrl(
        outcome.purchase.id,
        accessToken,
      );
      const first = outcome.lines[0];

      const validTickets = outcome.lines.filter(
        (line) => line.ticketCode && line.ticketStatus === "valid",
      );

      if (validTickets.length > 0) {
        for (const line of validTickets) {
          await sendPaymentApprovedEmail({
            purchaseId: outcome.purchase.id,
            attendeeName: outcome.contact.name,
            attendeeEmail: outcome.contact.email!,
            programName: line.programName,
            sessionTitle: line.sessionTitle,
            sessionType: line.sessionType,
            startsAt: line.startsAt,
            endsAt: line.endsAt,
            venueName: line.venueName,
            room: line.room,
            ticketCode: line.ticketCode!,
            landingUrl: secureLinkUrl,
            // A resend is a distinct delivery from the original approval.
            deliveryKey: `resend-${now.getTime()}`,
          });
        }
      } else if (first) {
        await sendPurchaseLinkEmail({
          purchaseId: outcome.purchase.id,
          buyerName: outcome.contact.name,
          buyerEmail: outcome.contact.email!,
          sessionTitle: first.sessionTitle,
          secureLinkUrl,
          resentAt: now,
        });
      }
    } catch (error) {
      console.error("Purchase link resend email failed", {
        purchaseId: data.purchaseId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }

    return {
      success: true,
      message: "Enviamos un enlace nuevo. El anterior dejó de funcionar.",
    };
  } catch (error) {
    console.error("Purchase link resend failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos reenviar el enlace. Intenta de nuevo.",
    };
  }
}
