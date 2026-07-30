"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import type { SessionType } from "@/app/lib/programs/definitions";
import {
  buildBuyerLandingUrl,
  sendPaymentApprovedEmail,
  sendVoucherChangesEmail,
} from "@/app/lib/programs/notifications";
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
  programSessions,
  programs,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchaseVouchers,
  sessionPurchases,
  sessionTickets,
  users,
  venues,
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
 * The buyer is notified after the commit, and a mail failure cannot undo the
 * decision. Rejection deliberately sends nothing — see `notifyBuyer`.
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

      // Gathered inside the transaction so the notification describes exactly
      // the state that was committed.
      const notify = await tx
        .select({
          sessionTitle: sessionPurchaseLines.sessionTitleSnapshot,
          startsAt: sessionPurchaseLines.occurrenceStartsAtSnapshot,
          sessionType: programSessions.type,
          endsAt: sessionOccurrences.endsAt,
          room: sessionOccurrences.room,
          venueName: venues.name,
          programName: programs.name,
          ticketCode: sessionTickets.code,
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
        ticketsIssued,
        purchase,
        notify,
      };
    });

    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath("/dashboard/programs", "layout");
    revalidatePath(`/programs/purchases/${data.purchaseId}`);

    /**
     * Isolated from the outer catch on purpose. The transaction has already
     * committed: the decision is recorded and any tickets are issued. If this
     * threw into the handler below, the admin would be told their decision
     * failed and would retry — and the retry would report the purchase as
     * already resolved, leaving them unsure whether the buyer was served.
     *
     * The individual senders already swallow their own failures; this guards
     * the buyer lookup, which queries the database and can fail on its own.
     */
    try {
      await notifyBuyer(data.decision, data.reason, outcome);
    } catch (error) {
      console.error("Purchase review notification failed", {
        purchaseId: data.purchaseId,
        decision: data.decision,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }

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

type NotifyRow = {
  sessionTitle: string;
  startsAt: Date;
  sessionType: SessionType;
  endsAt: Date;
  room: string | null;
  venueName: string | null;
  programName: string;
  ticketCode: string | null;
};

/**
 * Tells the buyer what was decided.
 *
 * Rejection sends nothing: the copy for "we did not accept your payment" needs
 * a refund and support story that Phase 5 owns, and a bare rejection email
 * would raise more questions than it answers. The admin sees the seat released
 * either way.
 *
 * No link can carry a token here — an admin only ever sees the stored digest —
 * so `buildBuyerLandingUrl` degrades to the profile area for a signed-in buyer
 * and to nothing for a guest, whose email copy points them at their own
 * reservation link instead.
 */
async function notifyBuyer(
  decision: ReviewDecision,
  reason: string,
  outcome: {
    purchase: {
      id: number;
      userId: number | null;
      guestName: string | null;
      guestEmail: string | null;
    };
    notify: NotifyRow[];
  },
): Promise<void> {
  if (decision === "reject") return;

  const [buyerName, buyerEmail] = await resolveBuyerContact(outcome.purchase);
  if (!buyerEmail) return;

  const landingUrl = buildBuyerLandingUrl({
    purchaseId: outcome.purchase.id,
    isSignedInBuyer: outcome.purchase.userId !== null,
  });

  if (decision === "request_changes") {
    const first = outcome.notify[0];
    if (!first) return;

    await sendVoucherChangesEmail({
      purchaseId: outcome.purchase.id,
      buyerName,
      buyerEmail,
      sessionTitle: first.sessionTitle,
      reason,
      landingUrl,
      requestedAt: new Date(),
    });
    return;
  }

  // One email per issued ticket, which is one today and stays correct when the
  // multi-session cart lands in Phase 4.
  for (const row of outcome.notify) {
    if (!row.ticketCode) continue;

    await sendPaymentApprovedEmail({
      purchaseId: outcome.purchase.id,
      attendeeName: buyerName,
      attendeeEmail: buyerEmail,
      programName: row.programName,
      sessionTitle: row.sessionTitle,
      sessionType: row.sessionType,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      venueName: row.venueName,
      room: row.room,
      ticketCode: row.ticketCode,
      landingUrl,
    });
  }
}

/** Guest details live on the purchase; a signed-in buyer's on their profile. */
async function resolveBuyerContact(purchase: {
  userId: number | null;
  guestName: string | null;
  guestEmail: string | null;
}): Promise<[string, string | null]> {
  if (purchase.userId === null) {
    return [purchase.guestName ?? "", purchase.guestEmail];
  }

  const [buyer] = await db
    .select({
      email: users.email,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(eq(users.id, purchase.userId))
    .limit(1);

  if (!buyer) return ["", null];

  const fullName = [buyer.firstName, buyer.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return [buyer.displayName?.trim() || fullName || buyer.email, buyer.email];
}
