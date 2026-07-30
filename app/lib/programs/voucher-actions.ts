"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccess } from "@/app/lib/programs/access";
import {
  buildBuyerLandingUrl,
  sendVoucherReceivedEmail,
} from "@/app/lib/programs/notifications";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import {
  isAuthorizedVoucherUrl,
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
} from "@/app/lib/programs/vouchers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  programSessions,
  sessionOccurrences,
  sessionPurchaseEvents,
  sessionPurchaseLines,
  sessionPurchaseVouchers,
  sessionPurchases,
  users,
} from "@/db/schema";

const submitSchema = z
  .object({
    purchaseId: z.number().int().positive(),
    /** UploadThing URL, produced by the endpoint that already authorized this. */
    fileUrl: z.string().trim().url().max(2000),
    /** The `key` from the same upload response, which pins `fileUrl`. */
    fileKey: z.string().trim().min(1).max(200),
    /** Present when the buyer arrived by secure link rather than signed in. */
    token: z.string().trim().min(1).max(200).optional(),
  })
  // Rejected at the schema boundary so no later branch can forget to ask.
  .refine((value) => isAuthorizedVoucherUrl(value.fileUrl, value.fileKey), {
    path: ["fileUrl"],
    message: "El comprobante no corresponde a un archivo subido",
  });

export type SubmitVoucherInput = z.input<typeof submitSchema>;

export type SubmitVoucherResult =
  | { success: true; message: string; version: number }
  | { success: false; message: string };

/**
 * A signed-in buyer's address lives on their profile — the identity CHECK
 * keeps the guest columns null for them.
 */
async function resolveBuyerEmail(purchase: {
  userId: number | null;
}): Promise<string | null> {
  if (purchase.userId === null) return null;

  const [buyer] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, purchase.userId))
    .limit(1);

  return buyer?.email ?? null;
}

/**
 * Records an uploaded payment proof and moves the purchase into review.
 *
 * Append-only: a replacement is a new row at the next version, so the file the
 * team actually looked at stays recoverable. The purchase row is locked before
 * the version is computed — two uploads racing would otherwise both read the
 * same `max(version)` and collide on the unique key.
 *
 * Authorization is re-checked here rather than trusted from the upload step: a
 * URL is guessable in a way a token is not, and this is the call that mutates.
 */
export async function submitPurchaseVoucher(
  input: SubmitVoucherInput,
): Promise<SubmitVoucherResult> {
  const blocked = await featureFlagGuard("paid_programs");
  if (blocked) return blocked;

  const parsed = submitSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "No pudimos registrar el comprobante" };
  }

  const data = parsed.data;
  const profile = await getCurrentUserProfile();
  const now = new Date();

  try {
    const outcome = await db.transaction(async (tx) => {
      // `FOR UPDATE` before anything is read from it: the version number and
      // the status transition both depend on this row not moving underneath us.
      const [purchase] = await tx
        .select()
        .from(sessionPurchases)
        .where(eq(sessionPurchases.id, data.purchaseId))
        .for("update")
        .limit(1);

      if (!purchase) return { kind: "denied" as const };

      const access = resolvePurchaseAccess({
        purchase,
        viewerUserId: profile?.id ?? null,
        presentedTokenHash: data.token ? hashAccessToken(data.token) : null,
      });

      // Same opaque refusal the page gives, so probing purchase ids by way of
      // this action tells an attacker no more than probing the page does.
      if (!access.granted) return { kind: "denied" as const };

      const check = resolveVoucherSubmission(purchase, now);
      if (!check.allowed) {
        return {
          kind: "error" as const,
          message: VOUCHER_BLOCKER_LABELS[check.blocker],
        };
      }

      const [{ max }] = await tx
        .select({
          max: sql<number>`coalesce(max(${sessionPurchaseVouchers.version}), 0)`,
        })
        .from(sessionPurchaseVouchers)
        .where(eq(sessionPurchaseVouchers.purchaseId, purchase.id));

      const version = Number(max) + 1;

      await tx.insert(sessionPurchaseVouchers).values({
        purchaseId: purchase.id,
        version,
        fileUrl: data.fileUrl,
        uploadedByUserId: profile?.id ?? null,
        uploadedVia: "buyer",
      });

      await tx
        .update(sessionPurchases)
        .set({
          status: "under_verification",
          // Stamped once, on the first version: it records when the buyer first
          // paid, not when they last swapped the photo.
          voucherSubmittedAt: purchase.voucherSubmittedAt ?? now,
          updatedAt: now,
        })
        .where(eq(sessionPurchases.id, purchase.id));

      await tx.insert(sessionPurchaseEvents).values({
        purchaseId: purchase.id,
        actorType: "buyer",
        actorUserId: profile?.id ?? null,
        eventType: version === 1 ? "voucher_uploaded" : "voucher_replaced",
        fromStatus: purchase.status,
        toStatus: "under_verification",
        changes: { version },
      });

      /**
       * Title comes from the snapshot — it survives later content edits. The
       * schedule comes wholly from the live occurrence: mixing a snapshot
       * `startsAt` with a live `endsAt` would print an interval that never
       * existed once a session is rescheduled, and the buyer is being told
       * when to show up, not what they booked weeks ago.
       *
       * Ordered and unlimited rather than `limit(1)`: a purchase carries one
       * line today, but Phase 4's cart will make that false, and an arbitrary
       * row would silently name one of several sessions.
       */
      const lines = await tx
        .select({
          sessionTitle: sessionPurchaseLines.sessionTitleSnapshot,
          sessionType: programSessions.type,
          startsAt: sessionOccurrences.startsAt,
          endsAt: sessionOccurrences.endsAt,
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
        .where(eq(sessionPurchaseLines.purchaseId, purchase.id))
        .orderBy(asc(sessionPurchaseLines.id));

      return {
        kind: "recorded" as const,
        version,
        purchase,
        lines,
        accessVia: access.via,
      };
    });

    if (outcome.kind === "denied") {
      return { success: false, message: "No pudimos registrar el comprobante" };
    }
    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath(`/programs/purchases/${data.purchaseId}`);
    revalidatePath("/dashboard/programs", "layout");

    /**
     * Isolated from the outer catch. The transaction has committed: the
     * voucher exists and the seat is held. Letting a failure here reach the
     * handler below would tell the buyer their upload failed, and their retry
     * would file a redundant replacement version.
     *
     * The send itself already swallows its errors; this guards the buyer
     * lookup, which queries the database.
     */
    try {
      const buyerEmail =
        outcome.purchase.guestEmail ??
        (await resolveBuyerEmail(outcome.purchase));

      const [first, ...rest] = outcome.lines;

      if (rest.length > 0) {
        // Phase 4 tripwire: the template describes one session, so a cart
        // purchase would silently omit the others.
        console.warn("Voucher acknowledgement covered only the first line", {
          purchaseId: outcome.purchase.id,
          lineCount: outcome.lines.length,
        });
      }

      if (buyerEmail && first) {
        await sendVoucherReceivedEmail({
          purchaseId: outcome.purchase.id,
          buyerName: outcome.purchase.guestName ?? buyerEmail,
          buyerEmail,
          sessionTitle: first.sessionTitle,
          sessionType: first.sessionType,
          startsAt: first.startsAt,
          endsAt: first.endsAt,
          totalAmount: outcome.purchase.totalAmount,
          version: outcome.version,
          landingUrl: buildBuyerLandingUrl({
            purchaseId: outcome.purchase.id,
            // Only when the token is what granted access. An owner reaching
            // this from their profile gets the profile link instead, so no
            // bearer credential is mailed to someone who does not need one.
            accessToken:
              outcome.accessVia === "token" ? (data.token ?? null) : null,
            isSignedInBuyer: outcome.purchase.userId !== null,
          }),
        });
      }
    } catch (error) {
      console.error("Voucher acknowledgement failed", {
        purchaseId: data.purchaseId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }

    return {
      success: true,
      version: outcome.version,
      message:
        outcome.version === 1
          ? "Recibimos tu comprobante. Lo revisaremos pronto."
          : "Reemplazamos tu comprobante. Revisaremos el nuevo.",
    };
  } catch (error) {
    console.error("Voucher submission failed", {
      purchaseId: data.purchaseId,
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return {
      success: false,
      message: "No pudimos registrar el comprobante. Intenta de nuevo.",
    };
  }
}
