"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import {
  resolvePurchaseAccess,
  resolvePurchaseAccessWithLazyViewer,
} from "@/app/lib/programs/access";
import {
  buildBuyerLandingUrl,
  sendAdminNewSignupEmail,
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
 * A signed-in buyer's name and address live on their profile — the identity
 * CHECK keeps the guest columns null for them, so greeting them from
 * `guestName` would fall through to their raw email address.
 */
async function resolveBuyerContact(purchase: {
  userId: number | null;
}): Promise<{ name: string; email: string } | null> {
  if (purchase.userId === null) return null;

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

  if (!buyer) return null;

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
  /**
   * Probe access before opening the transaction so a valid secure link never
   * touches Clerk. Authorization is still repeated against the locked row
   * below; this lookup only decides whether the owner fallback is necessary.
   */
  const purchaseForAccess = await db.query.sessionPurchases.findFirst({
    where: eq(sessionPurchases.id, data.purchaseId),
  });
  if (!purchaseForAccess) {
    return { success: false, message: "No pudimos registrar el comprobante" };
  }

  const { viewer: profile } = await resolvePurchaseAccessWithLazyViewer({
    purchase: purchaseForAccess,
    presentedTokenHash: data.token ? hashAccessToken(data.token) : null,
    loadViewer: getCurrentUserProfile,
    getViewerUserId: (viewer) => viewer.id,
  });
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
       * Ordered and unlimited: a cart purchase has several lines and the
       * acknowledgement names every one of them.
       */
      const lines = await tx
        .select({
          sessionTitle: sessionPurchaseLines.sessionTitleSnapshot,
          sessionType: programSessions.type,
          startsAt: sessionOccurrences.startsAt,
          endsAt: sessionOccurrences.endsAt,
          unitPrice: sessionPurchaseLines.unitPrice,
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

    let buyerEmail = outcome.purchase.guestEmail;
    let buyerName = outcome.purchase.guestName ?? "Cliente";

    try {
      const signedInBuyer = await resolveBuyerContact(outcome.purchase);
      buyerEmail ??= signedInBuyer?.email ?? null;
      buyerName =
        outcome.purchase.guestName ??
        signedInBuyer?.name ??
        buyerEmail ??
        "Cliente";
    } catch (error) {
      console.error("Voucher buyer lookup failed", {
        purchaseId: data.purchaseId,
        errorType: error instanceof Error ? error.name : typeof error,
      });
    }

    if (buyerEmail && outcome.lines.length > 0) {
      await sendVoucherReceivedEmail({
        purchaseId: outcome.purchase.id,
        buyerName,
        buyerEmail,
        lines: outcome.lines,
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

    // A replacement voucher is still the same signup, so notify admins only
    // for the first proof submitted.
    if (outcome.version === 1 && outcome.lines.length > 0) {
      try {
        const admins = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.role, "admin"));

        await sendAdminNewSignupEmail({
          purchaseId: outcome.purchase.id,
          attendeeName: buyerName,
          adminEmails: admins.map((admin) => admin.email),
          lines: outcome.lines,
          totalAmount: outcome.purchase.totalAmount,
        });
      } catch (error) {
        console.error("Admin new signup notification failed", {
          purchaseId: data.purchaseId,
          errorType: error instanceof Error ? error.name : typeof error,
        });
      }
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
