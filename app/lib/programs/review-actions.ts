"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  REVIEW_BLOCKER_LABELS,
  REVIEW_DECISION_STATUS,
  resolveReviewDecision,
  type ReviewDecision,
} from "@/app/lib/programs/review";
import { generateTicketCode } from "@/app/lib/programs/tokens";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchaseVouchers,
  sessionPurchases,
  sessionTickets,
  users,
} from "@/db/schema";

const reviewSchema = z.object({
  purchaseId: z.number().int().positive(),
  decision: z.enum(["approve", "reject", "request_changes"]),
  /**
   * Required for every decision. PRD §14: "every sensitive admin action
   * requires a reason" — and the buyer sees this text when changes are
   * requested, so it is the message as much as the audit record.
   */
  reason: z.string().trim().min(3).max(500),
});

export type ReviewPurchaseInput = z.input<typeof reviewSchema>;

export type ReviewPurchaseResult =
  | { success: true; message: string; ticketsIssued: number }
  | { success: false; message: string };

const DECISION_EVENT = {
  approve: "approved",
  reject: "rejected",
  request_changes: "changes_requested",
} as const;

const DECISION_MESSAGE: Record<ReviewDecision, string> = {
  approve: "Pago aprobado y entradas emitidas",
  reject: "Pago rechazado y cupo liberado",
  request_changes: "Le pedimos un nuevo comprobante",
};

/**
 * Records an admin's decision on a submitted payment proof.
 *
 * Approval is the only path that issues tickets, which is what makes "ticket
 * issuance and delivery only after approval" (roadmap Phase 3) structural
 * rather than a convention someone has to remember.
 *
 * Issuance is idempotent: `ON CONFLICT (purchase_line_id) DO NOTHING` means
 * approving twice — a double click, a retried request — cannot mint a second
 * ticket for the same seat.
 *
 * Emails are **not** sent here yet; that arrives with the notification work.
 * An approved purchase is already readable from the buyer's secure link.
 */
export async function reviewPurchase(
  input: ReviewPurchaseInput,
): Promise<ReviewPurchaseResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const admin = await requireAdminOrFestivalAdmin();
  if (!admin) return { success: false, message: "No autorizado" };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message:
        parsed.error.issues[0]?.message ?? "Escribe el motivo de tu decisión",
    };
  }

  const data = parsed.data;
  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      // Locked before anything is decided: the buyer may be replacing their
      // voucher at this exact moment, and that must serialize against this.
      const [purchase] = await tx
        .select()
        .from(sessionPurchases)
        .where(eq(sessionPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) {
        return { kind: "error" as const, message: "Compra no encontrada" };
      }

      const vouchers = await tx
        .select({ id: sessionPurchaseVouchers.id })
        .from(sessionPurchaseVouchers)
        .where(eq(sessionPurchaseVouchers.purchaseId, purchase.id));

      const check = resolveReviewDecision(
        { ...purchase, voucherCount: vouchers.length },
        data.decision,
      );

      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: REVIEW_BLOCKER_LABELS[check.blocker],
        };
      }

      const toStatus = REVIEW_DECISION_STATUS[data.decision];

      await tx
        .update(sessionPurchases)
        .set({
          status: toStatus,
          // Only the terminal decisions stamp a timestamp; the CHECK
          // constraint on this table requires it for exactly those.
          ...(data.decision === "approve" ? { approvedAt: now } : {}),
          ...(data.decision === "reject" ? { rejectedAt: now } : {}),
          updatedAt: now,
        })
        .where(eq(sessionPurchases.id, purchase.id));

      let ticketsIssued = 0;

      if (data.decision === "approve") {
        const lines = await tx
          .select({
            id: sessionPurchaseLines.id,
            occurrenceId: sessionPurchaseLines.occurrenceId,
          })
          .from(sessionPurchaseLines)
          .where(eq(sessionPurchaseLines.purchaseId, purchase.id));

        /**
         * Identity comes off the purchase, not the acting session — the admin
         * is approving, but the ticket belongs to the buyer.
         *
         * A signed-in buyer has null guest columns (the identity CHECK forbids
         * both being set), so their name and email have to be read from their
         * profile. `attendeeName`/`attendeeEmail` are `NOT NULL` and the email
         * carries a partial unique index, so an empty fallback would either
         * fail the insert or collide across purchases.
         */
        let attendeeName = purchase.guestName;
        let attendeeEmail = purchase.guestEmail;

        if (purchase.userId !== null) {
          const [buyer] = await tx
            .select({
              email: users.email,
              displayName: users.displayName,
              firstName: users.firstName,
              lastName: users.lastName,
            })
            .from(users)
            .where(eq(users.id, purchase.userId))
            .limit(1);

          if (!buyer) {
            return {
              kind: "error" as const,
              message: "No encontramos el perfil del comprador",
            };
          }

          const fullName = [buyer.firstName, buyer.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          attendeeName = buyer.displayName?.trim() || fullName || buyer.email;
          attendeeEmail = buyer.email;
        }

        if (!attendeeName || !attendeeEmail) {
          return {
            kind: "error" as const,
            message: "La compra no tiene datos de contacto",
          };
        }

        for (const line of lines) {
          const issued = await tx
            .insert(sessionTickets)
            .values({
              purchaseLineId: line.id,
              occurrenceId: line.occurrenceId,
              code: generateTicketCode(),
              attendeeUserId: purchase.userId,
              attendeeName,
              attendeeEmail,
              issuedAt: now,
            })
            .onConflictDoNothing({ target: sessionTickets.purchaseLineId })
            .returning({ id: sessionTickets.id });

          if (issued.length > 0) {
            ticketsIssued += 1;
            await tx.insert(sessionPurchaseEvents).values({
              purchaseId: purchase.id,
              actorType: "system",
              eventType: "ticket_issued",
              changes: {
                ticketId: issued[0].id,
                occurrenceId: line.occurrenceId,
              },
            });
          }
        }
      }

      await tx.insert(sessionPurchaseEvents).values({
        purchaseId: purchase.id,
        actorType: "admin",
        actorUserId: admin.id,
        eventType: DECISION_EVENT[data.decision],
        fromStatus: purchase.status,
        toStatus,
        reason: data.reason,
        changes: { ticketsIssued },
      });

      return { kind: "done" as const, ticketsIssued };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath(`/programs/purchases/${data.purchaseId}`);

    return {
      success: true,
      message: DECISION_MESSAGE[data.decision],
      ticketsIssued: outcome.ticketsIssued,
    };
  } catch (error) {
    console.error("Purchase review failed", {
      purchaseId: data.purchaseId,
      decision: data.decision,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar tu decisión. Intenta de nuevo.",
    };
  }
}
