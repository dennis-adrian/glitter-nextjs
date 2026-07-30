"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { featureFlagGuard } from "@/app/lib/feature_flags/helpers";
import { resolvePurchaseAccess } from "@/app/lib/programs/access";
import { hashAccessToken } from "@/app/lib/programs/tokens";
import {
  resolveVoucherSubmission,
  VOUCHER_BLOCKER_LABELS,
} from "@/app/lib/programs/vouchers";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { db } from "@/db";
import {
  sessionPurchaseEvents,
  sessionPurchaseVouchers,
  sessionPurchases,
} from "@/db/schema";

const submitSchema = z.object({
  purchaseId: z.number().int().positive(),
  /** UploadThing URL, produced by the endpoint that already authorized this. */
  fileUrl: z.string().trim().url().max(2000),
  /** Present when the buyer arrived by secure link rather than signed in. */
  token: z.string().trim().min(1).max(200).optional(),
});

export type SubmitVoucherInput = z.input<typeof submitSchema>;

export type SubmitVoucherResult =
  | { success: true; message: string; version: number }
  | { success: false; message: string };

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

      return { kind: "recorded" as const, version };
    });

    if (outcome.kind === "denied") {
      return { success: false, message: "No pudimos registrar el comprobante" };
    }
    if (outcome.kind === "error") {
      return { success: false, message: outcome.message };
    }

    revalidatePath(`/programs/purchases/${data.purchaseId}`);
    revalidatePath("/dashboard/programs", "layout");

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
